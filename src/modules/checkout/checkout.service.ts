import { emailQueue } from "@core/queue/bull";
import { EmailService } from "@shared/services/email.service";
import { NotFoundError, BadRequestError, ConflictError } from "@shared/utils/errors";
import {
  ICheckoutRepository,
  PrismaCheckoutRepository,
  TxClient,
  CreateOrderData,
} from "./checkout.repository";

const IDEMPOTENCY_TTL = parseInt(process.env.IDEMPOTENCY_TTL || "86400", 10);
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 100;
const FREE_SHIPPING_THRESHOLD = 500_000;
const SHIPPING_FEE = 30_000;
const TAX_RATE = 0.1;

export interface CheckoutInput {
  idempotencyKey: string;
  paymentMethod: "COD" | "CARD" | "BANKING";
  address: string;
  phone: string;
  notes?: string;
  discountCode?: string;
}

export class CheckoutService {
  constructor(
    private readonly repository: ICheckoutRepository = new PrismaCheckoutRepository(),
    private readonly emailService: EmailService = new EmailService(),
  ) {}

  async checkout(userId: string, input: CheckoutInput) {
    const idempotentResult = await this.tryReturnIdempotentOrder(input.idempotencyKey);
    if (idempotentResult) {
      return idempotentResult;
    }

    const user = await this.repository.findUserCartForCheckout(userId);
    if (!user || !user.cart || user.cart.items.length === 0) {
      throw new BadRequestError("Cart is empty");
    }

    const cartItems = user.cart.items;
    const subtotal = cartItems.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0,
    );

    const order = await this.executeWithRetry(async (tx) => {
      await this.reserveStock(tx, cartItems);

      const discountAmount = await this.applyDiscount(
        tx,
        input.discountCode,
        subtotal,
      );

      const tax = subtotal * TAX_RATE;
      const shippingFee = subtotal > FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
      const total = Math.max(0, subtotal + tax + shippingFee - discountAmount);

      const orderData: CreateOrderData = {
        orderNumber: `ORD-${Date.now().toString(36).toUpperCase()}`,
        userId,
        status: "PENDING",
        paymentMethod: input.paymentMethod,
        paymentStatus: "PENDING",
        subtotal,
        tax,
        shippingFee,
        total,
        discountAmount,
        discountCode: discountAmount > 0 ? input.discountCode : undefined,
        customerName: `${user.firstName} ${user.lastName}`,
        customerEmail: user.email,
        customerPhone: input.phone || user.phone || "",
        customerAddress: input.address,
        notes: input.notes,
        idempotencyKey: input.idempotencyKey,
      };

      const newOrder = await this.repository.createOrder(tx, orderData);

      await this.repository.createOrderItems(
        tx,
        cartItems.map((item) => ({
          orderId: newOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          price: item.product.price,
          total: item.product.price * item.quantity,
        })),
      );

      await this.repository.clearCartItems(tx, user.cart!.id);

      return newOrder;
    });

    if (input.idempotencyKey) {
      await this.repository.cacheOrderId(
        input.idempotencyKey,
        order.id,
        IDEMPOTENCY_TTL,
      );
    }

    await this.notifyOrderConfirmation(user.email, order, cartItems);

    return { order, idempotent: false };
  }

  async getOrder(orderId: string, userId: string) {
    const order = await this.repository.findOrderByUserAndId(orderId, userId);
    if (!order) {
      throw new NotFoundError("Order not found");
    }
    return order;
  }

  async getOrders(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.repository.findOrdersByUser(userId, skip, limit),
      this.repository.countOrdersByUser(userId),
    ]);

    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ---------- Private orchestration helpers ----------

  private async tryReturnIdempotentOrder(idempotencyKey: string) {
    if (!idempotencyKey) return null;

    const cachedOrderId = await this.repository.findCachedOrderId(idempotencyKey);
    if (!cachedOrderId) return null;

    const order = await this.repository.findOrderWithItems(cachedOrderId);
    return order ? { order, idempotent: true } : null;
  }

  private async reserveStock(
    tx: TxClient,
    cartItems: { productId: string; quantity: number }[],
  ): Promise<void> {
    const productIds = cartItems.map((item) => item.productId);
    const lockedProducts = await this.repository.lockProductsForUpdate(
      tx,
      productIds,
    );
    const productMap = new Map(lockedProducts.map((p) => [p.id, p]));

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
      const product = productMap.get(item.productId)!;
      const success = await this.repository.decrementProductStock(
        tx,
        item.productId,
        product.version,
        item.quantity,
      );
      if (!success) {
        throw new ConflictError(
          `Stock conflict for product ${item.productId}. Please retry.`,
        );
      }
    }
  }

  private async applyDiscount(
    tx: TxClient,
    discountCode: string | undefined,
    subtotal: number,
  ): Promise<number> {
    if (!discountCode) {
      return 0;
    }

    const discount = await this.repository.findDiscountByCode(tx, discountCode);

    if (!discount || !discount.isActive) {
      throw new BadRequestError("Invalid or inactive discount code");
    }

    if (discount.expiresAt && discount.expiresAt < new Date()) {
      throw new BadRequestError("Discount code has expired");
    }

    if (discount.minOrderAmount != null && subtotal < discount.minOrderAmount) {
      throw new BadRequestError(
        `Order must be at least ${discount.minOrderAmount} to use this discount code`,
      );
    }

    const success = await this.repository.incrementDiscountUsage(
      tx,
      discount.id,
      discount.maxUses,
    );
    if (!success) {
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
    operation: (tx: TxClient) => Promise<T>,
    retryCount = 0,
  ): Promise<T> {
    try {
      return await this.repository.runInTransaction(operation);
    } catch (error) {
      if (error instanceof ConflictError && retryCount < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, retryCount);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeWithRetry(operation, retryCount + 1);
      }
      throw error;
    }
  }

  private async notifyOrderConfirmation(
    email: string,
    order: { orderNumber: string; total: number },
    cartItems: { product: { name: string; price: number }; quantity: number }[],
  ): Promise<void> {
    await emailQueue.add("order-confirmation", {
      to: email,
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

    await this.emailService.sendOrderConfirmation(
      { email },
      { orderNumber: order.orderNumber, total: order.total },
      cartItems.map((item) => ({
        product: { name: item.product.name },
        quantity: item.quantity,
        price: item.product.price,
      })),
    );
  }
}