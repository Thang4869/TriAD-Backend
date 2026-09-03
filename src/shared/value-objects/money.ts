export class Money {
  private readonly amount: number;
  private readonly currency: string = "VND";

  constructor(amount: number, currency: string = "VND") {
    if (amount < 0) throw new Error("Amount cannot be negative");
    this.amount = Math.round(amount);
    this.currency = currency;
  }

  getValue(): number {
    return this.amount;
  }

  getCurrency(): string {
    return this.currency;
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) throw new Error("Currency mismatch");
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) throw new Error("Currency mismatch");
    return new Money(this.amount - other.amount, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(this.amount * factor, this.currency);
  }

  toString(): string {
    return `${this.amount.toLocaleString("vi-VN")} ${this.currency}`;
  }

  lessThan(other: Money): boolean {
    if (this.currency !== other.currency) throw new Error("Currency mismatch");
    return this.amount < other.amount;
  }
}
