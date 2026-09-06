import { BaseDomainEvent } from "./domain-event";

export class ProductStockDepletedEvent extends BaseDomainEvent {
  static readonly eventName = "ProductStockDepleted";

  constructor(
    public readonly productId: string,
    public readonly productName: string,
  ) {
    super(productId, "ProductStockDepleted", { productName });
  }
}

export class ProductRestockedEvent extends BaseDomainEvent {
  static readonly eventName = "ProductRestocked";

  constructor(
    public readonly productId: string,
    public readonly quantityAdded: number,
    public readonly newStock: number,
  ) {
    super(productId, "ProductRestocked", { quantityAdded, newStock });
  }
}

export class ProductPriceChangedEvent extends BaseDomainEvent {
  static readonly eventName = "ProductPriceChanged";

  constructor(
    public readonly productId: string,
    public readonly oldPrice: number,
    public readonly newPrice: number,
  ) {
    super(productId, "ProductPriceChanged", { oldPrice, newPrice });
  }
}

export class ProductDeactivatedEvent extends BaseDomainEvent {
  static readonly eventName = "ProductDeactivated";

  constructor(public readonly productId: string) {
    super(productId, "ProductDeactivated");
  }
}

export class ProductActivatedEvent extends BaseDomainEvent {
  static readonly eventName = "ProductActivated";

  constructor(public readonly productId: string) {
    super(productId, "ProductActivated");
  }
}
