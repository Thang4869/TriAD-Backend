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
import { ConflictError } from "@shared/errors/application-error";
import {
  describePrismaError,
  isPrismaSerializationConflict,
} from "@core/database/prisma-error-classifier";
import type { MetricsPort } from "@shared/application/observability/metrics.port";
import { logger } from "@core/logger/winston";
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
    private readonly metrics?: MetricsPort,
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
    const startedAt = performance.now();
    try {
      await this.persistTypedEvents(
        this.tx,
        [event],
        new Map([[event.aggregateId, sourceVersion]]),
      );
    } finally {
      this.observeStage("product_outbox", performance.now() - startedAt);
    }
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

    const orderStartedAt = performance.now();
    try {
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
    } finally {
      this.observeStage(
        "order_persistence",
        performance.now() - orderStartedAt,
      );
    }

    const outboxStartedAt = performance.now();
    try {
      await persistDomainEvents(this.tx, [order], new Map([[order.id, 0]]));
    } finally {
      this.observeStage("order_outbox", performance.now() - outboxStartedAt);
    }

    return toSavedCheckoutOrder(created);
  }

  private observeStage(stage: string, durationMs: number): void {
    try {
      this.metrics?.observe?.("checkout.stage.duration", durationMs, { stage });
    } catch {
      logger.warn("Checkout stage metrics observation failed", { stage });
    }
  }
}

export class PrismaCheckoutUnitOfWork implements CheckoutUnitOfWork {
  constructor(
    private readonly persistTypedEvents: PersistEvents = persistEvents,
    private readonly metrics?: MetricsPort,
  ) {}

  async run<T>(
    work: (transaction: CheckoutTransaction) => Promise<T>,
  ): Promise<T> {
    const startedAt = performance.now();
    try {
      const result = await prisma.$transaction(
        (tx) =>
          work(
            new PrismaCheckoutTransaction(
              tx,
              this.persistTypedEvents,
              this.metrics,
            ),
          ),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: TRANSACTION_TIMEOUT_MS,
        },
      );
      this.observeTransaction(performance.now() - startedAt);
      return result;
    } catch (error) {
      this.observeTransaction(performance.now() - startedAt);
      const details = describePrismaError(error);
      if (isPrismaSerializationConflict(error)) {
        logger.warn("Checkout transaction serialization conflict observed", {
          errorCategory: details.category,
          prismaCode: details.code,
          prismaModel: details.model,
          observedOperation: "transaction_callback",
        });
      }
      if (isPrismaSerializationConflict(error)) {
        throw new ConflictError("Transaction conflict. Please retry.");
      }

      throw error;
    }
  }

  private observeTransaction(durationMs: number): void {
    try {
      this.metrics?.observe?.("checkout.stage.duration", durationMs, {
        stage: "transaction",
      });
    } catch {
      logger.warn("Checkout transaction metrics observation failed");
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
