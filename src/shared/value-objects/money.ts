export const MONEY_CURRENCY = "VND";
export const MONEY_ROUNDING_POLICY = "half-up" as const;

export class Money {
  private readonly amount: number;
  private readonly currency: string;

  constructor(amount: number, currency: string = MONEY_CURRENCY) {
    if (!Number.isFinite(amount)) {
      throw new Error("Amount must be finite");
    }
    if (amount < 0) throw new Error("Amount cannot be negative");
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error("Invalid currency");
    }

    const normalizedAmount = Math.round(amount);
    if (!Number.isSafeInteger(normalizedAmount)) {
      throw new Error("Amount must be a safe integer");
    }

    this.amount = normalizedAmount;
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
    if (!Number.isFinite(factor) || factor < 0) {
      throw new Error("Factor must be finite and non-negative");
    }
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
