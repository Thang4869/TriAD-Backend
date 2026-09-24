export class OrderNumber {
  private readonly value: string;

  constructor(value: string) {
    const normalized = value.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{3,39}$/.test(normalized)) {
      throw new Error("Invalid order number");
    }
    this.value = normalized;
  }

  getValue(): string {
    return this.value;
  }

  toString(): string {
    return this.value;
  }
}
