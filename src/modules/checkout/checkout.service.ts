import prisma from "@core/database/prisma";
import { redis } from "@core/redis/client";
import { emailQueue } from "@core/queue/bull";
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from "@shared/utils/errors";
import { Prisma } from "@prisma/client";

export class CheckoutService {
  private readonly IDEMPOTENCY_TTL = parseInt(
    process.env.IDEMPOTENCY_TTL || "86400",
    10,
  );

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
          include: { items: true },
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

    const stockChecks = await Promise.all(
      cartItems.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: { id: true, stock: true, name: true, price: true },
        });
        if (!product) {
          throw new NotFoundError(`Product ${item.productId} not found`);
        }
        if (product.stock < item.quantity) {
          throw new BadRequestError(
            `Not enough stock for ${product.name}. Available: ${product.stock}`,
          );
        }
        return product;
      }),
    );

    let discountAmount = 0;
    if (discountCode) {
    }

    const tax = subtotal * 0.1;
    const shippingFee = subtotal > 500000 ? 0 : 30000;
    const total = subtotal + tax + shippingFee - discountAmount;

    const order = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        for (const item of cartItems) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: { stock: true },
          });
          if (!product) {
            throw new NotFoundError(`Product ${item.productId} not found`);
          }
          const updateResult = await tx.product.updateMany({
            where: {
              id: item.productId,
              stock: { gte: item.quantity },
            },
            data: {
              stock: { decrement: item.quantity },
            },
          });
          if (updateResult.count === 0) {
            throw new ConflictError(
              `Stock conflict for product ${item.productId}. Please retry.`,
            );
          }
        }

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
          discountCode,
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
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000,
      },
    );

    if (idempotencyKey) {
      await redis.setex(
        `idempotent:${idempotencyKey}`,
        this.IDEMPOTENCY_TTL,
        JSON.stringify(order.id),
      );
    }

    await emailQueue.add("order-confirmation", {
      to: user.email,
      subject: `Order #${order.orderNumber} Confirmed`,
      template: "order-confirmation",
      data: {
        orderNumber: order.orderNumber,
        total: order.total,
        items: cartItems.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: item.product.price,
        })),
      },
    });

    return { order, idempotent: false };
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
