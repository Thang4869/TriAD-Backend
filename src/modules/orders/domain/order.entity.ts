import { OrderStatus } from "./order-status";
import { Money } from "@shared/value-objects/money";
import {
  OrderPlacedEvent,
  OrderStatusChangedEvent,
  OrderCancelledEvent,
} from "@shared/domain/events/order-events";
import { AggregateRoot } from "@shared/domain/aggregate-root";

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

export class Order extends AggregateRoot {
  private _items: OrderItem[] = [];
  private _status: OrderStatus;
  private _discountAmount: Money;
  private _shippingFee: Money;
  private _tax: Money;
  private _discountCode?: string;
  private _placed = false;

  private constructor(
    id: string,
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
    discountAmount: Money,
    shippingFee: Money,
    tax: Money,
    public readonly notes?: string,
    discountCode?: string,
  ) {
    super(id);
    this._status = status;
    this._discountAmount = discountAmount;
    this._shippingFee = shippingFee;
    this._tax = tax;
    this._discountCode = discountCode;
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
    notes?: string;
  }): Order {
    return new Order(
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
      new Money(0),
      new Money(0),
      new Money(0),
      props.notes,
    );
  }

  get status(): OrderStatus {
    return this._status;
  }

  get discountAmount(): Money {
    return this._discountAmount;
  }

  get shippingFee(): Money {
    return this._shippingFee;
  }

  get tax(): Money {
    return this._tax;
  }

  get discountCode(): string | undefined {
    return this._discountCode;
  }

  get items(): ReadonlyArray<OrderItem> {
    return this._items;
  }

  get subtotal(): Money {
    return this._items.reduce((sum, item) => sum.add(item.total), new Money(0));
  }

  get total(): Money {
    const raw = this.subtotal
      .add(this._tax)
      .add(this._shippingFee)
      .subtract(this._discountAmount);
    return new Money(Math.max(0, raw.getValue()));
  }

  private assertMutable(): void {
    if (this._placed) {
      throw new Error("Cannot modify an order that has already been placed");
    }
    if (this._status !== OrderStatus.PENDING) {
      throw new Error("Cannot modify an order that is not PENDING");
    }
  }

  addItem(
    productId: string,
    productName: string,
    quantity: number,
    unitPrice: Money,
  ): void {
    this.assertMutable();
    if (quantity <= 0) {
      throw new Error("Quantity must be positive");
    }
    const existing = this._items.find((item) => item.productId === productId);
    if (existing) {
      const idx = this._items.indexOf(existing);
      this._items[idx] = new OrderItem(
        productId,
        productName,
        existing.quantity + quantity,
        unitPrice,
      );
    } else {
      this._items.push(
        new OrderItem(productId, productName, quantity, unitPrice),
      );
    }
  }

  removeItem(productId: string): void {
    this.assertMutable();
    const idx = this._items.findIndex((item) => item.productId === productId);
    if (idx === -1) return;
    this._items.splice(idx, 1);
  }

  applyPricing(pricing: {
    tax: Money;
    shippingFee: Money;
    discountAmount: Money;
    discountCode?: string;
  }): void {
    this.assertMutable();
    if (pricing.discountAmount.getValue() > this.subtotal.getValue()) {
      throw new Error("Discount cannot exceed order subtotal");
    }
    this._tax = pricing.tax;
    this._shippingFee = pricing.shippingFee;
    this._discountAmount = pricing.discountAmount;
    this._discountCode = pricing.discountCode;
  }

  place(): void {
    if (this._placed) {
      throw new Error("Order has already been placed");
    }
    if (this._items.length === 0) {
      throw new Error("Cannot place an order with no items");
    }
    this._placed = true;
    this.raise(
      new OrderPlacedEvent(
        this.id,
        this.userId,
        this.orderNumber,
        this.customerName,
        this.customerEmail,
        this.total.getValue(),
        this._items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice.getValue(),
        })),
      ),
    );
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
    this.raise(new OrderCancelledEvent(this.id, this.userId));
  }

  private transitionStatus(newStatus: OrderStatus): void {
    const oldStatus = this._status;
    if (!this.canTransitionTo(oldStatus, newStatus)) {
      throw new Error(`Cannot transition from ${oldStatus} to ${newStatus}`);
    }
    this._status = newStatus;
    this.raise(
      new OrderStatusChangedEvent(this.id, oldStatus, newStatus, this.userId),
    );
  }

  private canTransitionTo(current: OrderStatus, next: OrderStatus): boolean {
    return Order.canTransition(current, next);
  }

  static canTransition(current: OrderStatus, next: OrderStatus): boolean {
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
    order._placed = true;
    if (data.version !== undefined) {
      order.setVersionFromPersistence(data.version);
    }
    return order;
  }
}
