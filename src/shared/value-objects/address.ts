export class Address {
  private readonly value: string;

  constructor(value: string) {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (normalized.length === 0 || normalized.length > 500) {
      throw new Error("Invalid address");
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
