import type { Order } from "@modules/orders/domain/order.entity";
import type { DomainEvent } from "@shared/domain/events/domain-event";

import type {
  DiscountRecord,
  LockedProductRow,
  SavedCheckoutOrder,
} from "./checkout-models";

export interface CheckoutTransaction {
  lockProductsForUpdate(productIds: string[]): Promise<LockedProductRow[]>;

  decrementProductStock(
    productId: string,
    expectedVersion: number,
    quantity: number,
  ): Promise<boolean>;

  persistProductEvent(event: DomainEvent, sourceVersion: number): Promise<void>;

  findDiscountByCode(code: string): Promise<DiscountRecord | null>;

  incrementDiscountUsage(
    discountId: string,
    maxUses: number | null,
  ): Promise<boolean>;

  clearCartItems(cartId: string): Promise<void>;

  saveNewOrder(
    order: Order,
    idempotencyKey?: string,
  ): Promise<SavedCheckoutOrder>;
}

export interface CheckoutUnitOfWork {
  run<T>(work: (transaction: CheckoutTransaction) => Promise<T>): Promise<T>;
}
