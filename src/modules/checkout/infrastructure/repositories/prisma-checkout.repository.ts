import prisma from "@core/database/prisma";
import { Order, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import {
  persistDomainEvents,
  persistEvents,
} from "@core/outbox/persist-domain-events";
import type {
  DiscountRecord,
  ICheckoutRepository,
  LockedProductRow,
} from "../../application/ports/checkout.repository.port";
import type { CheckoutTransaction } from "../../application/ports/checkout-transaction";
import type {
  OrderWithItems,
  SavedCheckoutOrder,
  UserCartForCheckout,
} from "../../application/ports/checkout-models";
import type { Order as OrderAggregate } from "@modules/orders/domain/order.entity";
import { IdempotencyConflictError } from "../../application/errors/idempotency-conflict.error";
import { ConflictError } from "@/shared/utils/errors";
import type { DomainEvent } from "@shared/domain/events/domain-event";
import {
  toSafeDecimalNumber,
  toSafeMoneyNumber,
} from "@shared/infrastructure/money-number";

const TRANSACTION_TIMEOUT_MS = 10_000;
type PersistEvents = typeof persistEvents;

function toPrismaTx(tx: CheckoutTransaction): Prisma.TransactionClient {
  return tx as unknown as Prisma.TransactionClient;
}

interface CreateOrderData {
  orderNumber: string;
  userId: string;
  status: "PENDING";
  paymentMethod: "COD";
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
  idempotencyKey?: string;
}

interface CreateOrderItemData {
  orderId: string;
  productId: string;
  quantity: number;
  price: number;
  total: number;
}

// ---------- Prisma implementation ----------

export class PrismaCheckoutRepository implements ICheckoutRepository {
  constructor(
    private readonly persistTypedEvents: PersistEvents = persistEvents,
  ) {}

  async findOrderWithItems(orderId: string): Promise<OrderWithItems | null> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });
    return order ? toOrderWithItems(order) : null;
  }

  async findOrderByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<OrderWithItems | null> {
    const order = await prisma.order.findFirst({
      where: {
        userId,
        idempotencyKey,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });
    return order ? toOrderWithItems(order) : null;
  }

  async findUserCartForCheckout(
    userId: string,
  ): Promise<UserCartForCheckout | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        cart: {
          include: { items: { include: { product: true } } },
        },
      },
    });
    if (!user) return null;
    return {
      ...user,
      cart: user.cart
        ? {
            ...user.cart,
            items: user.cart.items.map((item) => ({
              ...item,
              product: {
                ...item.product,
                price: toSafeMoneyNumber(item.product.price),
              },
            })),
          }
        : null,
    };
  }

  async runInTransaction<T>(
    fn: (tx: CheckoutTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await prisma.$transaction(
        (tx) => fn(tx as unknown as CheckoutTransaction),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: TRANSACTION_TIMEOUT_MS,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        throw new ConflictError("Transaction conflict. Please retry.");
      }

      throw error;
    }
  }

  async lockProductsForUpdate(
    tx: CheckoutTransaction,
    productIds: string[],
  ): Promise<LockedProductRow[]> {
    const prismaTx = toPrismaTx(tx);
    const rows = await prismaTx.$queryRaw<
      Array<
        Omit<LockedProductRow, "price"> & {
          price: Prisma.Decimal | number | string;
        }
      >
    >`
      SELECT id, name, price, stock, version, "isActive"
      FROM products
      WHERE id = ANY(${productIds})
      FOR UPDATE
    `;
    return rows.map((row) => ({
      ...row,
      price: toSafeMoneyNumber(row.price),
    }));
  }

  async decrementProductStock(
    tx: CheckoutTransaction,
    productId: string,
    expectedVersion: number,
    quantity: number,
  ): Promise<boolean> {
    const prismaTx = toPrismaTx(tx);
    const result = await prismaTx.product.updateMany({
      where: { id: productId, version: expectedVersion },
      data: {
        stock: { decrement: quantity },
        version: { increment: 1 },
      },
    });
    return result.count > 0;
  }

  async persistProductEvent(
    tx: CheckoutTransaction,
    event: DomainEvent,
    sourceVersion: number,
  ): Promise<void> {
    await this.persistTypedEvents(
      toPrismaTx(tx),
      [event],
      new Map([[event.aggregateId, sourceVersion]]),
    );
  }

  async findDiscountByCode(
    tx: CheckoutTransaction,
    code: string,
  ): Promise<DiscountRecord | null> {
    const prismaTx = toPrismaTx(tx);
    const discount = await prismaTx.discount.findUnique({ where: { code } });
    return discount
      ? {
          ...discount,
          value: toSafeDecimalNumber(discount.value),
          minOrderAmount:
            discount.minOrderAmount == null
              ? null
              : toSafeMoneyNumber(discount.minOrderAmount),
        }
      : null;
  }

  async incrementDiscountUsage(
    tx: CheckoutTransaction,
    discountId: string,
    maxUses: number | null,
  ): Promise<boolean> {
    const prismaTx = toPrismaTx(tx);
    const result = await prismaTx.discount.updateMany({
      where: {
        id: discountId,
        ...(maxUses != null ? { usedCount: { lt: maxUses } } : {}),
      },
      data: { usedCount: { increment: 1 } },
    });
    return result.count > 0;
  }

  async createOrder(
    tx: CheckoutTransaction,
    data: CreateOrderData,
  ): Promise<Order> {
    const prismaTx = toPrismaTx(tx);
    return prismaTx.order.create({ data });
  }

  async saveNewOrder(
    tx: CheckoutTransaction,
    order: OrderAggregate,
    idempotencyKey?: string,
  ): Promise<SavedCheckoutOrder> {
    const prismaTx = toPrismaTx(tx);
    let created: Order;

    try {
      created = await prismaTx.order.create({
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          status: order.status,
          paymentMethod: order.paymentMethod as PaymentMethod,
          paymentStatus: order.paymentStatus as PaymentStatus,
          subtotal: order.subtotal.getValue(),
          tax: order.tax.getValue(),
          shippingFee: order.shippingFee.getValue(),
          total: order.total.getValue(),
          discountAmount: order.discountAmount.getValue(),
          discountCode: order.discountCode,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone,
          customerAddress: order.customerAddress,
          notes: order.notes,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
      });
    } catch (error) {
      if (
        idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const target = error.meta?.target;

        const targets = Array.isArray(target)
          ? target.map(String)
          : typeof target === "string"
            ? [target]
            : [];

        if (targets.some((field) => field.includes("idempotencyKey"))) {
          throw new IdempotencyConflictError();
        }
      }

      throw error;
    }

    await prismaTx.orderItem.createMany({
      data: order.items.map((item) => ({
        orderId: created.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.unitPrice.getValue(),
        total: item.total.getValue(),
      })),
    });

    await persistDomainEvents(
      toPrismaTx(tx),
      [order],
      new Map([[order.id, 0]]),
    );

    return toSavedCheckoutOrder(created);
  }

  async createOrderItems(
    tx: CheckoutTransaction,
    items: CreateOrderItemData[],
  ): Promise<void> {
    const prismaTx = toPrismaTx(tx);
    await prismaTx.orderItem.createMany({ data: items });
  }

  async clearCartItems(tx: CheckoutTransaction, cartId: string): Promise<void> {
    const prismaTx = toPrismaTx(tx);
    await prismaTx.cartItem.deleteMany({ where: { cartId } });
  }

  async findOrdersByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<OrderWithItems[]> {
    const orders = await prisma.order.findMany({
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
    });
    return orders.map(toOrderWithItems);
  }

  async countOrdersByUser(userId: string): Promise<number> {
    return prisma.order.count({ where: { userId } });
  }

  async findOrderByUserAndId(
    orderId: string,
    userId: string,
  ): Promise<OrderWithItems | null> {
    const order = await prisma.order.findFirst({
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
    });
    return order ? toOrderWithItems(order) : null;
  }
}

type CheckoutOrderRecord = {
  id: string;
  orderNumber: string;
  userId: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: Prisma.Decimal;
  tax: Prisma.Decimal;
  shippingFee: Prisma.Decimal;
  total: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  discountCode: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  notes: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  items: Array<{
    id: string;
    orderId: string;
    productId: string;
    quantity: number;
    price: Prisma.Decimal;
    total: Prisma.Decimal;
    product: {
      id: string;
      name: string;
      images: string[];
      slug: string;
    };
  }>;
};

function toOrderWithItems(order: CheckoutOrderRecord): OrderWithItems {
  return {
    ...toSavedCheckoutOrder(order),
    items: order.items.map((item) => ({
      ...item,
      price: toSafeMoneyNumber(item.price),
      total: toSafeMoneyNumber(item.total),
    })),
  };
}

function toSavedCheckoutOrder(
  order: Omit<CheckoutOrderRecord, "items"> | CheckoutOrderRecord,
): SavedCheckoutOrder {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    subtotal: toSafeMoneyNumber(order.subtotal),
    tax: toSafeMoneyNumber(order.tax),
    shippingFee: toSafeMoneyNumber(order.shippingFee),
    total: toSafeMoneyNumber(order.total),
    discountAmount: toSafeMoneyNumber(order.discountAmount),
    discountCode: order.discountCode,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    notes: order.notes,
    idempotencyKey: order.idempotencyKey,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    version: order.version,
  };
}
