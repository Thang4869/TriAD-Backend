import { Money } from "@shared/value-objects/money";
import { AggregateRoot } from "@shared/domain/aggregate-root";
import {
  ProductStockDepletedEvent,
  ProductRestockedEvent,
  ProductPriceChangedEvent,
  ProductActivatedEvent,
  ProductDeactivatedEvent,
} from "@shared/domain/events/product-events";

export class Product extends AggregateRoot {
  private _stock: number;
  private _isActive: boolean;

  private constructor(
    id: string,
    public readonly name: string,
    public readonly description: string | null,
    private _price: Money,
    stock: number,
    public readonly category: string,
    public readonly images: string[],
    public readonly slug: string,
    isActive: boolean,
  ) {
    super(id);
    this._stock = stock;
    this._isActive = isActive;
  }

  get price(): Money {
    return this._price;
  }

  get stock(): number {
    return this._stock;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  changePrice(newPrice: Money): void {
    if (newPrice.getValue() < 0) throw new Error("Price cannot be negative");
    if (newPrice.getValue() === this._price.getValue()) return;
    const oldPrice = this._price.getValue();
    this._price = newPrice;
    this.raise(
      new ProductPriceChangedEvent(this.id, oldPrice, newPrice.getValue()),
    );
  }

  reduceStock(quantity: number): void {
    if (quantity <= 0) throw new Error("Quantity must be positive");
    if (this._stock < quantity)
      throw new Error(`Insufficient stock. Available: ${this._stock}`);
    this._stock -= quantity;
    if (this._stock === 0) {
      this.raise(new ProductStockDepletedEvent(this.id, this.name));
    }
  }

  increaseStock(quantity: number): void {
    if (quantity <= 0) throw new Error("Quantity must be positive");
    this._stock += quantity;
    this.raise(new ProductRestockedEvent(this.id, quantity, this._stock));
  }

  activate(): void {
    if (this._isActive) throw new Error("Product already active");
    this._isActive = true;
    this.raise(new ProductActivatedEvent(this.id));
  }

  deactivate(): void {
    if (!this._isActive) throw new Error("Product already inactive");
    this._isActive = false;
    this.raise(new ProductDeactivatedEvent(this.id));
  }

  static hydrate(data: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    stock: number;
    category: string;
    images: string[];
    slug: string;
    isActive: boolean;
    version?: number;
  }): Product {
    const product = new Product(
      data.id,
      data.name,
      data.description,
      new Money(data.price),
      data.stock,
      data.category,
      data.images,
      data.slug,
      data.isActive,
    );
    if (data.version !== undefined) {
      product.setVersionFromPersistence(data.version);
    }
    return product;
  }
}
