import { Money } from "@shared/value-objects/money";
import {
  CartItemAddedEvent,
  CartItemRemovedEvent,
  CartClearedEvent,
} from "@shared/domain/events/cart-events";
import { BaseDomainEvent } from "@shared/domain/events/domain-event";

export class CartItem {
  constructor(
    public readonly productId: string,
    public readonly productName: string,
    public readonly unitPrice: Money,
    public quantity: number,
  ) {}

  get total(): Money {
    return this.unitPrice.multiply(this.quantity);
  }

  increase(amount: number): void {
    if (amount <= 0) throw new Error("Amount must be positive");
    this.quantity += amount;
  }

  decrease(amount: number): void {
    if (amount <= 0) throw new Error("Amount must be positive");
    if (this.quantity - amount < 0)
      throw new Error("Quantity cannot be negative");
    this.quantity -= amount;
  }
}

export class Cart {
  private _items: Map<string, CartItem> = new Map();
  private _events: BaseDomainEvent[] = [];

  private constructor(
    public readonly id: string,
    public readonly userId: string,
  ) {}

  static create(id: string, userId: string): Cart {
    return new Cart(id, userId);
  }

  get items(): ReadonlyArray<CartItem> {
    return Array.from(this._items.values());
  }

  get total(): Money {
    return this.items.reduce((sum, item) => sum.add(item.total), new Money(0));
  }

  get itemCount(): number {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  get events(): ReadonlyArray<BaseDomainEvent> {
    return this._events;
  }

  private addEvent(event: BaseDomainEvent): void {
    this._events.push(event);
  }

  addItem(
    productId: string,
    productName: string,
    unitPrice: Money,
    quantity: number,
  ): void {
    if (quantity <= 0) throw new Error("Quantity must be positive");
    if (this._items.has(productId)) {
      const existing = this._items.get(productId)!;
      existing.increase(quantity);
    } else {
      this._items.set(
        productId,
        new CartItem(productId, productName, unitPrice, quantity),
      );
    }
    this.addEvent(
      new CartItemAddedEvent(this.id, this.userId, productId, quantity),
    );
  }

  updateItemQuantity(productId: string, quantity: number): void {
    if (quantity < 0) throw new Error("Quantity cannot be negative");
    if (!this._items.has(productId)) {
      throw new Error(`Item ${productId} not found in cart`);
    }
    if (quantity === 0) {
      this.removeItem(productId);
      return;
    }
    const existing = this._items.get(productId)!;
    const delta = quantity - existing.quantity;
    existing.quantity = quantity;
    this.addEvent(
      new CartItemAddedEvent(this.id, this.userId, productId, delta),
    );
  }

  removeItem(productId: string): void {
    if (!this._items.has(productId)) return;
    this._items.delete(productId);
    this.addEvent(new CartItemRemovedEvent(this.id, this.userId, productId));
  }

  clear(): void {
    if (this._items.size === 0) return;
    this._items.clear();
    this.addEvent(new CartClearedEvent(this.id, this.userId));
  }

  static hydrate(data: {
    id: string;
    userId: string;
    items: Array<{
      productId: string;
      productName: string;
      price: number;
      quantity: number;
    }>;
  }): Cart {
    const cart = new Cart(data.id, data.userId);
    for (const item of data.items) {
      cart._items.set(
        item.productId,
        new CartItem(
          item.productId,
          item.productName,
          new Money(item.price),
          item.quantity,
        ),
      );
    }
    return cart;
  }

  clearEvents(): void {
    this._events = [];
  }
}
