import { BaseDomainEvent } from "./domain-event";

export class CartItemAddedEvent extends BaseDomainEvent {
  constructor(
    public readonly cartId: string,
    public readonly userId: string,
    public readonly productId: string,
    public readonly quantity: number,
  ) {
    super(cartId, "CartItemAdded", { userId, productId, quantity });
  }
}

export class CartItemRemovedEvent extends BaseDomainEvent {
  constructor(
    public readonly cartId: string,
    public readonly userId: string,
    public readonly productId: string,
  ) {
    super(cartId, "CartItemRemoved", { userId, productId });
  }
}

export class CartClearedEvent extends BaseDomainEvent {
  constructor(
    public readonly cartId: string,
    public readonly userId: string,
  ) {
    super(cartId, "CartCleared", { userId });
  }
}
