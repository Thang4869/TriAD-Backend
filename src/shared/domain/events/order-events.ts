import { BaseDomainEvent } from "./domain-event";
import { OrderStatus } from "@prisma/client";

export class OrderPlacedEvent extends BaseDomainEvent {
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly total: number,
    public readonly items: Array<{
      productId: string;
      quantity: number;
      price: number;
    }>,
  ) {
    super(orderId, "OrderPlaced", { userId, total });
  }
}

export class OrderStatusChangedEvent extends BaseDomainEvent {
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
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
  ) {
    super(orderId, "OrderCancelled", { userId });
  }
}
