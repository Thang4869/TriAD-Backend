import { Money } from "@shared/value-objects/money";

export type DecimalLike = number | string | { toString(): string };

export function toSafeMoneyNumber(value: DecimalLike): number {
  const numeric = toFiniteNumber(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new Error(
      "Persisted monetary value must be a safe non-negative integer",
    );
  }
  return new Money(numeric).getValue();
}

export function toSafeDecimalNumber(value: DecimalLike): number {
  const numeric = toFiniteNumber(value);
  if (!Number.isSafeInteger(Math.round(numeric)) || numeric < 0) {
    throw new Error("Persisted decimal value is outside the safe range");
  }
  return numeric;
}

function toFiniteNumber(value: DecimalLike): number {
  const numeric = typeof value === "number" ? value : Number(value.toString());
  if (!Number.isFinite(numeric)) {
    throw new Error("Persisted numeric value must be finite");
  }
  return numeric;
}
