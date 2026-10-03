import { BaseDomainEvent } from "./domain-event";
import type { PaymentStatus } from "@shared/constants/order.constant";

export type OrderStatus =
  "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";

export interface OrderPlacedItemSnapshot {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export class OrderPlacedEvent extends BaseDomainEvent {
  static readonly eventName = "OrderPlaced";

  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly orderNumber: string,
    public readonly customerName: string,
    public readonly customerEmail: string,
    public readonly paymentStatus: PaymentStatus,
    public readonly subtotal: number,
    public readonly tax: number,
    public readonly shippingFee: number,
    public readonly total: number,
    public readonly items: OrderPlacedItemSnapshot[],
  ) {
    super(orderId, "OrderPlaced", {
      userId,
      orderNumber,
      paymentStatus,
      subtotal,
      tax,
      shippingFee,
      total,
    });
  }
}

/**
 * Canonical order lifecycle transition event.
 *
 * Generic consumers such as order-history projections and user notifications
 * subscribe to this event, including transitions to CANCELLED.
 */

export class OrderStatusChangedEvent extends BaseDomainEvent {
  static readonly eventName = "OrderStatusChanged";

  constructor(
    public readonly orderId: string,
    public readonly oldStatus: OrderStatus,
    public readonly newStatus: OrderStatus,
    public readonly userId: string,
  ) {
    super(orderId, "OrderStatusChanged", { oldStatus, newStatus, userId });
  }
}

/**
 * Cancellation-specific semantic event.
 *
 * This event exists for cancellation-only workflows such as stock release or
 * payment refund. Generic status projections and notifications must continue
 * to consume OrderStatusChangedEvent instead, otherwise cancellation could
 * produce duplicate side effects.
 */

export class OrderCancelledEvent extends BaseDomainEvent {
  static readonly eventName = "OrderCancelled";

  constructor(
    public readonly orderId: string,
    public readonly userId: string,
  ) {
    super(orderId, "OrderCancelled", { userId });
  }
}
