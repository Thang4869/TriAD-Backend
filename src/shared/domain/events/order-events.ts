import { BaseDomainEvent } from "./domain-event";
import { OrderStatus } from "@prisma/client";

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
    public readonly total: number,
    public readonly items: OrderPlacedItemSnapshot[],
  ) {
    super(orderId, "OrderPlaced", { userId, total, orderNumber });
  }
}

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

export class OrderCancelledEvent extends BaseDomainEvent {
  static readonly eventName = "OrderCancelled";

  constructor(
    public readonly orderId: string,
    public readonly userId: string,
  ) {
    super(orderId, "OrderCancelled", { userId });
  }
}
