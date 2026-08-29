import prisma from "@core/database/prisma";
import redis from "@core/redis/client";
import { Prisma, Order } from "@prisma/client";

export type TxClient = Prisma.TransactionClient;

const IDEMPOTENCY_KEY_PREFIX = "idempotent:";
const TRANSACTION_TIMEOUT_MS = 10_000;

export type UserCartForCheckout = Prisma.UserGetPayload<{
  include: {
    cart: {
      include: { items: { include: { product: true } } };
    };
  };
}>;

export type OrderWithItems = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        product: {
          select: { id: true; name: true; images: true; slug: true };
        };
      };
    };
  };
}>;

export interface LockedProductRow {
  id: string;
  stock: number;
  version: number;
  name: string;
  price: number;
}

export interface DiscountRecord {
  id: string;
  code: string;
  isActive: boolean;
  expiresAt: Date | null;
  minOrderAmount: number | null;
  maxUses: number | null;
  usedCount: number;
  type: "PERCENTAGE" | "FIXED";
  value: number;
}

export interface CreateOrderData {
  orderNumber: string;
  userId: string;
  status: "PENDING";
  paymentMethod: "COD" | "CARD" | "BANKING";
  paymentStatus: "PENDING";
  subtotal: number;
  tax: number;
  shippingFee: number;
  total: number;
  discountAmount: number;
  discountCode?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  notes?: string;
  idempotencyKey: string;
}

export interface CreateOrderItemData {
  orderId: string;
  productId: string;
  quantity: number;
  price: number;
  total: number;
}

// ---------- Repository contract ----------

export interface ICheckoutRepository {
  findCachedOrderId(idempotencyKey: string): Promise<string | null>;
  cacheOrderId(
    idempotencyKey: string,
    orderId: string,
    ttlSeconds: number,
  ): Promise<void>;

  findOrderWithItems(orderId: string): Promise<OrderWithItems | null>;
  findUserCartForCheckout(userId: string): Promise<UserCartForCheckout | null>;

  runInTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T>;

  lockProductsForUpdate(
    tx: TxClient,
    productIds: string[],
  ): Promise<LockedProductRow[]>;
  decrementProductStock(
    tx: TxClient,
    productId: string,
    expectedVersion: number,
    quantity: number,
  ): Promise<boolean>;

  findDiscountByCode(
    tx: TxClient,
    code: string,
  ): Promise<DiscountRecord | null>;
  incrementDiscountUsage(
    tx: TxClient,
    discountId: string,
    maxUses: number | null,
  ): Promise<boolean>;

  createOrder(tx: TxClient, data: CreateOrderData): Promise<Order>;
  createOrderItems(tx: TxClient, items: CreateOrderItemData[]): Promise<void>;
  clearCartItems(tx: TxClient, cartId: string): Promise<void>;

  findOrdersByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<OrderWithItems[]>;
  countOrdersByUser(userId: string): Promise<number>;
  findOrderByUserAndId(
    orderId: string,
    userId: string,
  ): Promise<OrderWithItems | null>;
}

// ---------- Prisma implementation ----------

export class PrismaCheckoutRepository implements ICheckoutRepository {
  async findCachedOrderId(idempotencyKey: string): Promise<string | null> {
    const cached = await redis.get(
      `${IDEMPOTENCY_KEY_PREFIX}${idempotencyKey}`,
    );
    return cached ? (JSON.parse(cached) as string) : null;
  }

  async cacheOrderId(
    idempotencyKey: string,
    orderId: string,
    ttlSeconds: number,
  ): Promise<void> {
    await redis.setex(
      `${IDEMPOTENCY_KEY_PREFIX}${idempotencyKey}`,
      ttlSeconds,
      JSON.stringify(orderId),
    );
  }

  async findOrderWithItems(orderId: string): Promise<OrderWithItems | null> {
    return prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    }) as unknown as Promise<OrderWithItems | null>;
  }

  async findUserCartForCheckout(
    userId: string,
  ): Promise<UserCartForCheckout | null> {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        cart: {
          include: { items: { include: { product: true } } },
        },
      },
    });
  }

  async runInTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: TRANSACTION_TIMEOUT_MS,
    });
  }

  async lockProductsForUpdate(
    tx: TxClient,
    productIds: string[],
  ): Promise<LockedProductRow[]> {
    return tx.$queryRaw<LockedProductRow[]>`
      SELECT id, stock, version, name, price
      FROM products
      WHERE id = ANY(${productIds})
      FOR UPDATE
    `;
  }

  async decrementProductStock(
    tx: TxClient,
    productId: string,
    expectedVersion: number,
    quantity: number,
  ): Promise<boolean> {
    const result = await tx.product.updateMany({
      where: { id: productId, version: expectedVersion },
      data: {
        stock: { decrement: quantity },
        version: { increment: 1 },
      },
    });
    return result.count > 0;
  }

  async findDiscountByCode(
    tx: TxClient,
    code: string,
  ): Promise<DiscountRecord | null> {
    return (tx as any).discount.findUnique({ where: { code } });
  }

  async incrementDiscountUsage(
    tx: TxClient,
    discountId: string,
    maxUses: number | null,
  ): Promise<boolean> {
    const result = await (tx as any).discount.updateMany({
      where: {
        id: discountId,
        ...(maxUses != null ? { usedCount: { lt: maxUses } } : {}),
      },
      data: { usedCount: { increment: 1 } },
    });
    return result.count > 0;
  }

  async createOrder(tx: TxClient, data: CreateOrderData): Promise<Order> {
    return tx.order.create({ data });
  }

  async createOrderItems(
    tx: TxClient,
    items: CreateOrderItemData[],
  ): Promise<void> {
    await tx.orderItem.createMany({ data: items });
  }

  async clearCartItems(tx: TxClient, cartId: string): Promise<void> {
    await tx.cartItem.deleteMany({ where: { cartId } });
  }

  async findOrdersByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<OrderWithItems[]> {
    return prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, images: true, slug: true },
            },
          },
        },
      },
    }) as unknown as Promise<OrderWithItems[]>;
  }

  async countOrdersByUser(userId: string): Promise<number> {
    return prisma.order.count({ where: { userId } });
  }

  async findOrderByUserAndId(
    orderId: string,
    userId: string,
  ): Promise<OrderWithItems | null> {
    return prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, images: true, slug: true },
            },
          },
        },
      },
    }) as unknown as Promise<OrderWithItems | null>;
  }
}
