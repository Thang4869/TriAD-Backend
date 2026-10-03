import prisma from "@core/database/prisma";
import {
  Order as PrismaOrder,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from "@prisma/client";

import {
  persistDomainEvents,
  persistEvents,
} from "@core/outbox/persist-domain-events";
import type {
  CheckoutTransaction,
  CheckoutUnitOfWork,
} from "../application/ports/checkout-transaction";
import type {
  DiscountRecord,
  LockedProductRow,
} from "../application/ports/checkout-models";
import type { SavedCheckoutOrder } from "../application/ports/checkout-models";
import type { Order } from "@modules/orders/domain/order.entity";
import type { DomainEvent } from "@shared/domain/events/domain-event";
import { IdempotencyConflictError } from "../application/errors/idempotency-conflict.error";
import { ConflictError } from "@shared/utils/errors";
import {
  toSafeDecimalNumber,
  toSafeMoneyNumber,
} from "@shared/infrastructure/money-number";

const TRANSACTION_TIMEOUT_MS = 10_000;

type PersistEvents = typeof persistEvents;

class PrismaCheckoutTransaction implements CheckoutTransaction {
  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly persistTypedEvents: PersistEvents,
  ) {}

  async lockProductsForUpdate(
    productIds: string[],
  ): Promise<LockedProductRow[]> {
    const rows = await this.tx.$queryRaw<
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
    productId: string,
    expectedVersion: number,
    quantity: number,
  ): Promise<boolean> {
    const result = await this.tx.product.updateMany({
      where: {
        id: productId,
        version: expectedVersion,
      },
      data: {
        stock: { decrement: quantity },
        version: { increment: 1 },
      },
    });

    return result.count > 0;
  }

  async persistProductEvent(
    event: DomainEvent,
    sourceVersion: number,
  ): Promise<void> {
    await this.persistTypedEvents(
      this.tx,
      [event],
      new Map([[event.aggregateId, sourceVersion]]),
    );
  }

  async findDiscountByCode(code: string): Promise<DiscountRecord | null> {
    const discount = await this.tx.discount.findUnique({
      where: { code },
    });

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
    discountId: string,
    maxUses: number | null,
  ): Promise<boolean> {
    const result = await this.tx.discount.updateMany({
      where: {
        id: discountId,
        ...(maxUses != null
          ? {
              usedCount: {
                lt: maxUses,
              },
            }
          : {}),
      },
      data: {
        usedCount: {
          increment: 1,
        },
      },
    });

    return result.count > 0;
  }

  async clearCartItems(cartId: string): Promise<void> {
    await this.tx.cartItem.deleteMany({
      where: { cartId },
    });
  }

  async saveNewOrder(
    order: Order,
    idempotencyKey?: string,
  ): Promise<SavedCheckoutOrder> {
    let created: PrismaOrder;

    try {
      created = await this.tx.order.create({
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

    await this.tx.orderItem.createMany({
      data: order.items.map((item) => ({
        orderId: created.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.unitPrice.getValue(),
        total: item.total.getValue(),
      })),
    });

    await persistDomainEvents(this.tx, [order], new Map([[order.id, 0]]));

    return toSavedCheckoutOrder(created);
  }
}

export class PrismaCheckoutUnitOfWork implements CheckoutUnitOfWork {
  constructor(
    private readonly persistTypedEvents: PersistEvents = persistEvents,
  ) {}

  async run<T>(
    work: (transaction: CheckoutTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await prisma.$transaction(
        (tx) =>
          work(new PrismaCheckoutTransaction(tx, this.persistTypedEvents)),
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
}

function toSavedCheckoutOrder(order: PrismaOrder): SavedCheckoutOrder {
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
