import { OrderStatus } from "@prisma/client";
import { Money } from "@shared/value-objects/money";
import {
  OrderPlacedEvent,
  OrderStatusChangedEvent,
  OrderCancelledEvent,
} from "@shared/domain/events/order-events";
import { DomainEvent } from "@/shared/domain/events/domain-event";

export class OrderItem {
  constructor(
    public readonly productId: string,
    public readonly productName: string,
    public readonly quantity: number,
    public readonly unitPrice: Money,
  ) {}

  get total(): Money {
    return this.unitPrice.multiply(this.quantity);
  }
}

export class Order {
  private _items: OrderItem[] = [];
  private _status: OrderStatus;
  private _total: Money;
  private _version: number = 0;
  private _events: DomainEvent[] = [];

  private constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly orderNumber: string,
    status: OrderStatus,
    public readonly createdAt: Date,
    public readonly customerName: string,
    public readonly customerEmail: string,
    public readonly customerPhone: string,
    public readonly customerAddress: string,
    public readonly paymentMethod: string,
    public readonly paymentStatus: string,
    public readonly discountAmount: Money,
    public readonly shippingFee: Money,
    public readonly tax: Money,
    public readonly notes?: string,
    public readonly discountCode?: string,
  ) {
    this._status = status;
    this._total = new Money(0);
  }

  static create(props: {
    id: string;
    userId: string;
    orderNumber: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    customerAddress: string;
    paymentMethod: string;
    discountAmount?: Money;
    shippingFee?: Money;
    tax?: Money;
    notes?: string;
    discountCode?: string;
  }): Order {
    const order = new Order(
      props.id,
      props.userId,
      props.orderNumber,
      OrderStatus.PENDING,
      new Date(),
      props.customerName,
      props.customerEmail,
      props.customerPhone,
      props.customerAddress,
      props.paymentMethod,
      "PENDING",
      props.discountAmount || new Money(0),
      props.shippingFee || new Money(0),
      props.tax || new Money(0),
      props.notes,
      props.discountCode,
    );
    order.addEvent(new OrderPlacedEvent(props.id, props.userId, 0, []));
    return order;
  }

  get status(): OrderStatus {
    return this._status;
  }

  get total(): Money {
    return this._total;
  }

  get items(): ReadonlyArray<OrderItem> {
    return this._items;
  }

  get version(): number {
    return this._version;
  }

  get events(): ReadonlyArray<DomainEvent> {
    return this._events;
  }

  private addEvent(event: DomainEvent): void {
    this._events.push(event);
    this._version++;
  }

  addItem(
    productId: string,
    productName: string,
    quantity: number,
    unitPrice: Money,
  ): void {
    if (this._status !== OrderStatus.PENDING) {
      throw new Error("Cannot add items to order that is not PENDING");
    }
    if (quantity <= 0) {
      throw new Error("Quantity must be positive");
    }
    const existing = this._items.find((item) => item.productId === productId);
    if (existing) {
      const newQty = existing.quantity + quantity;
      const idx = this._items.indexOf(existing);
      this._items[idx] = new OrderItem(
        productId,
        productName,
        newQty,
        unitPrice,
      );
    } else {
      this._items.push(
        new OrderItem(productId, productName, quantity, unitPrice),
      );
    }
    this.recalculateTotal();
  }

  removeItem(productId: string): void {
    if (this._status !== OrderStatus.PENDING) {
      throw new Error("Cannot remove items from order that is not PENDING");
    }
    const idx = this._items.findIndex((item) => item.productId === productId);
    if (idx === -1) return;
    this._items.splice(idx, 1);
    this.recalculateTotal();
  }

  private recalculateTotal(): void {
    const subtotal = this._items.reduce(
      (sum, item) => sum.add(item.total),
      new Money(0),
    );
    const total = subtotal
      .add(this.tax)
      .add(this.shippingFee)
      .subtract(this.discountAmount);
    this._total = new Money(Math.max(0, total.getValue()));
  }

  confirm(): void {
    this.transitionStatus(OrderStatus.PROCESSING);
  }

  ship(): void {
    this.transitionStatus(OrderStatus.SHIPPED);
  }

  deliver(): void {
    this.transitionStatus(OrderStatus.DELIVERED);
  }

  cancel(): void {
    if (this._status === OrderStatus.DELIVERED) {
      throw new Error("Cannot cancel a delivered order");
    }
    if (this._status === OrderStatus.CANCELLED) {
      throw new Error("Order already cancelled");
    }
    this.transitionStatus(OrderStatus.CANCELLED);
    this.addEvent(new OrderCancelledEvent(this.id, this.userId));
  }

  private transitionStatus(newStatus: OrderStatus): void {
    const oldStatus = this._status;
    if (!this.canTransitionTo(oldStatus, newStatus)) {
      throw new Error(`Cannot transition from ${oldStatus} to ${newStatus}`);
    }
    this._status = newStatus;
    this.addEvent(
      new OrderStatusChangedEvent(this.id, oldStatus, newStatus, this.userId),
    );
  }

  private canTransitionTo(current: OrderStatus, next: OrderStatus): boolean {
    const transitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.CANCELLED]: [],
      [OrderStatus.REFUNDED]: [],
    };
    return transitions[current]?.includes(next) || false;
  }

  static hydrate(data: {
    id: string;
    userId: string;
    orderNumber: string;
    status: OrderStatus;
    createdAt: Date;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    customerAddress: string;
    paymentMethod: string;
    paymentStatus: string;
    discountAmount: number;
    shippingFee: number;
    tax: number;
    notes?: string;
    discountCode?: string;
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      price: number;
    }>;
    version?: number;
  }): Order {
    const order = new Order(
      data.id,
      data.userId,
      data.orderNumber,
      data.status,
      data.createdAt,
      data.customerName,
      data.customerEmail,
      data.customerPhone,
      data.customerAddress,
      data.paymentMethod,
      data.paymentStatus,
      new Money(data.discountAmount),
      new Money(data.shippingFee),
      new Money(data.tax),
      data.notes,
      data.discountCode,
    );
    for (const item of data.items) {
      order._items.push(
        new OrderItem(
          item.productId,
          item.productName,
          item.quantity,
          new Money(item.price),
        ),
      );
    }
    order.recalculateTotal();
    if (data.version !== undefined) {
      order._version = data.version;
    }
    return order;
  }

  clearEvents(): void {
    this._events = [];
  }
}
