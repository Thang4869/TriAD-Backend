import { Money } from "@shared/value-objects/money";

export class Product {
  private _stock: number;
  private _isActive: boolean;
  private _version: number = 0;

  private constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string | null,
    private _price: Money,
    stock: number,
    public readonly category: string,
    public readonly images: string[],
    public readonly slug: string,
    isActive: boolean,
  ) {
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

  get version(): number {
    return this._version;
  }

  changePrice(newPrice: Money): void {
    if (newPrice.getValue() < 0) throw new Error("Price cannot be negative");
    this._price = newPrice;
    this._version++;
  }

  reduceStock(quantity: number): void {
    if (quantity <= 0) throw new Error("Quantity must be positive");
    if (this._stock < quantity)
      throw new Error(`Insufficient stock. Available: ${this._stock}`);
    this._stock -= quantity;
    this._version++;
  }

  increaseStock(quantity: number): void {
    if (quantity <= 0) throw new Error("Quantity must be positive");
    this._stock += quantity;
    this._version++;
  }

  activate(): void {
    if (this._isActive) throw new Error("Product already active");
    this._isActive = true;
    this._version++;
  }

  deactivate(): void {
    if (!this._isActive) throw new Error("Product already inactive");
    this._isActive = false;
    this._version++;
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
      product._version = data.version;
    }
    return product;
  }
}
