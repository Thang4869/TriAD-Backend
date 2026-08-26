import prisma from "@core/database/prisma";
import redis from "@core/redis/client";
import { emailQueue } from "@core/queue/bull";
import { EmailService } from '@shared/services/email.service';
import { Prisma } from "@prisma/client";

import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from "@shared/utils/errors";

export class CheckoutService {
  private readonly IDEMPOTENCY_TTL = parseInt(process.env.IDEMPOTENCY_TTL || "86400", 10,);
  private readonly MAX_RETRIES = 5;
  private readonly BASE_DELAY_MS = 100;
  private readonly emailService: EmailService;
  
  constructor(emailService?: EmailService) {
    this.emailService = emailService || new EmailService();
  }

  async checkout(
    userId: string,
    {
      idempotencyKey,
      paymentMethod,
      address,
      phone,
      notes,
      discountCode,
    }: {
      idempotencyKey: string;
      paymentMethod: "COD" | "CARD" | "BANKING";
      address: string;
      phone: string;
      notes?: string;
      discountCode?: string;
    },
  ) {
    if (idempotencyKey) {
      const cached = await redis.get(`idempotent:${idempotencyKey}`);
      if (cached) {
        const orderId = JSON.parse(cached);
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: { items: { include: { product: true } } },
        });
        if (order) {
          return { order, idempotent: true };
        }
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        cart: {
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    if (!user || !user.cart || user.cart.items.length === 0) {
      throw new BadRequestError("Cart is empty");
    }

    const cartItems = user.cart.items;

    const subtotal = cartItems.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0,
    );

    const result = await this.executeWithRetry(async (tx) => {
      const productIds = cartItems.map((item) => item.productId);
      const products = await tx.$queryRaw<any[]>`
        SELECT id, stock, version, name, price 
        FROM products 
        WHERE id = ANY(${productIds})
        FOR UPDATE
      `;

      const productMap = new Map(
        products.map((p) => [p.id, p])
      );

      for (const item of cartItems) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new NotFoundError(`Product ${item.productId} not found`);
        }
        if (product.stock < item.quantity) {
          throw new BadRequestError(
            `Not enough stock for ${product.name}. Available: ${product.stock}`,
          );
        }
      }

      for (const item of cartItems) {
        const product = productMap.get(item.productId);
        const updateResult = await tx.product.updateMany({
          where: {
            id: item.productId,
            version: product.version,
          },
          data: {
            stock: { decrement: item.quantity },
            version: { increment: 1 },
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictError(
            `Stock conflict for product ${item.productId}. Please retry.`
          );
        }
      }

      const discountAmount = await this.applyDiscount(
        tx,
        discountCode,
        subtotal,
      );

      const tax = subtotal * 0.1;
      const shippingFee = subtotal > 500000 ? 0 : 30000;
      const total = Math.max(0, subtotal + tax + shippingFee - discountAmount);

      const orderData = {
        orderNumber: `ORD-${Date.now().toString(36).toUpperCase()}`,
        userId,
        status: "PENDING" as const,
        paymentMethod,
        paymentStatus: "PENDING" as const,
        subtotal,
        tax,
        shippingFee,
        total,
        discountAmount,
        discountCode: discountAmount > 0 ? discountCode : undefined,
        customerName: `${user.firstName} ${user.lastName}`,
        customerEmail: user.email,
        customerPhone: phone || user.phone || "",
        customerAddress: address,
        notes,
        idempotencyKey,
      };

      const newOrder = await tx.order.create({
        data: orderData,
      });

      await tx.orderItem.createMany({
        data: cartItems.map((item) => ({
          orderId: newOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          price: item.product.price,
          total: item.product.price * item.quantity,
        })),
      });

      await tx.cartItem.deleteMany({
        where: { cartId: user.cart!.id },
      });

      return newOrder;
    });

    if (idempotencyKey) {
      await redis.setex(
        `idempotent:${idempotencyKey}`,
        this.IDEMPOTENCY_TTL,
        JSON.stringify(result.id),
      );
    }

    await emailQueue.add("order-confirmation", {
      to: user.email,
      subject: `Order #${result.orderNumber} Confirmed`,
      template: "order-confirmation",
      data: {
        orderNumber: result.orderNumber,
        total: result.total,
        items: cartItems.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: item.product.price,
        })),
      },
    });

    await this.emailService.sendOrderConfirmation(
      { email: user.email },
      { orderNumber: result.orderNumber, total: result.total },
      cartItems.map(item => ({
        product: { name: item.product.name },
        quantity: item.quantity,
        price: item.product.price,
      }))
    );

    return { order: result, idempotent: false };
  }

  private async applyDiscount(
    tx: Prisma.TransactionClient,
    discountCode: string | undefined,
    subtotal: number,
  ): Promise<number> {
    if (!discountCode) {
      return 0;
    }

    const discount = await (tx as any).discount.findUnique({
      where: { code: discountCode },
    });

    if (!discount || !discount.isActive) {
      throw new BadRequestError("Invalid or inactive discount code");
    }

    if (discount.expiresAt && discount.expiresAt < new Date()) {
      throw new BadRequestError("Discount code has expired");
    }

    if (
      discount.minOrderAmount != null &&
      subtotal < discount.minOrderAmount
    ) {
      throw new BadRequestError(
        `Order must be at least ${discount.minOrderAmount} to use this discount code`,
      );
    }

    const updateResult = await (tx as any).discount.updateMany({
      where: {
        id: discount.id,
        ...(discount.maxUses != null
          ? { usedCount: { lt: discount.maxUses } }
          : {}),
      },
      data: { usedCount: { increment: 1 } },
    });

    if (updateResult.count === 0) {
      throw new ConflictError(
        "Discount code just reached its usage limit. Please retry.",
      );
    }

    const rawAmount =
      discount.type === "PERCENTAGE"
        ? subtotal * (discount.value / 100)
        : discount.value;

    return Math.min(rawAmount, subtotal);
  }

  private async executeWithRetry<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    retryCount: number = 0,
  ): Promise<T> {
    try {
      return await prisma.$transaction(
        async (tx) => operation(tx),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 10000,
        },
      );
    } catch (error) {
      if (
        error instanceof ConflictError &&
        retryCount < this.MAX_RETRIES
      ) {
        const delay = this.BASE_DELAY_MS * Math.pow(2, retryCount);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeWithRetry(operation, retryCount + 1);
      }
      throw error;
    }
  }

  async getOrder(orderId: string, userId: string) {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundError("Order not found");
    }

    return order;
  }

  async getOrders(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  images: true,
                },
              },
            },
          },
        },
      }),
      prisma.order.count({ where: { userId } }),
    ]);

    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}