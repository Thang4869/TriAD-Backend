import type { Order as OrderAggregate } from "@modules/orders/domain/order.entity";
import type { DomainEvent } from "@shared/domain/events/domain-event";
import type { CheckoutTransaction } from "./checkout-transaction";
import type {
  OrderWithItems,
  SavedCheckoutOrder,
  UserCartForCheckout,
} from "./checkout-models";

export interface LockedProductRow {
  id: string;
  stock: number;
  version: number;
  name: string;
  price: number;
  isActive: boolean;
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

export interface ICheckoutRepository {
  findOrderWithItems(orderId: string): Promise<OrderWithItems | null>;
  findOrderByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<OrderWithItems | null>;
  findUserCartForCheckout(userId: string): Promise<UserCartForCheckout | null>;

  runInTransaction<T>(fn: (tx: CheckoutTransaction) => Promise<T>): Promise<T>;

  lockProductsForUpdate(
    tx: CheckoutTransaction,
    productIds: string[],
  ): Promise<LockedProductRow[]>;

  decrementProductStock(
    tx: CheckoutTransaction,
    productId: string,
    expectedVersion: number,
    quantity: number,
  ): Promise<boolean>;

  persistProductEvent(
    tx: CheckoutTransaction,
    event: DomainEvent,
    sourceVersion: number,
  ): Promise<void>;

  findDiscountByCode(
    tx: CheckoutTransaction,
    code: string,
  ): Promise<DiscountRecord | null>;

  incrementDiscountUsage(
    tx: CheckoutTransaction,
    discountId: string,
    maxUses: number | null,
  ): Promise<boolean>;

  clearCartItems(tx: CheckoutTransaction, cartId: string): Promise<void>;

  saveNewOrder(
    tx: CheckoutTransaction,
    order: OrderAggregate,
    idempotencyKey?: string,
  ): Promise<SavedCheckoutOrder>;

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
