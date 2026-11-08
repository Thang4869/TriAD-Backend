import { describe, expect, it } from "vitest";
import {
  toSafeDecimalNumber,
  toSafeMoneyNumber,
} from "@shared/infrastructure/money-number";

describe("toSafeMoneyNumber", () => {
  it.each([
    ["number", 1250],
    ["numeric string", "1250"],
    ["Decimal-like object", { toString: () => "1250" }],
  ])("converts a %s to a safe money number", (_label, value) => {
    expect(toSafeMoneyNumber(value as number | string | { toString(): string })).toBe(1250);
  });

  it("accepts the maximum safe integer", () => {
    expect(toSafeMoneyNumber(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it.each([NaN, Infinity, -Infinity, "not-a-number"])(
    "rejects non-finite input %s",
    (value) => {
      expect(() => toSafeMoneyNumber(value as number | string)).toThrow(
        "Persisted numeric value must be finite",
      );
    },
  );

  it.each([-1, "-10", 1.5, "12.5", Number.MAX_SAFE_INTEGER + 1])(
    "rejects negative, fractional, or unsafe monetary input %s",
    (value) => {
      expect(() => toSafeMoneyNumber(value)).toThrow(
        "Persisted monetary value must be a safe non-negative integer",
      );
    },
  );
});

describe("toSafeDecimalNumber", () => {
  it.each([
    ["number", 12.75],
    ["numeric string", "12.75"],
    ["Decimal-like object", { toString: () => "12.75" }],
  ])("converts a %s without rounding its decimal portion", (_label, value) => {
    expect(
      toSafeDecimalNumber(value as number | string | { toString(): string }),
    ).toBe(12.75);
  });

  it("accepts zero and the maximum safe integer", () => {
    expect(toSafeDecimalNumber(0)).toBe(0);
    expect(toSafeDecimalNumber(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it.each([NaN, Infinity, -Infinity, "invalid"])(
    "rejects non-finite input %s",
    (value) => {
      expect(() => toSafeDecimalNumber(value as number | string)).toThrow(
        "Persisted numeric value must be finite",
      );
    },
  );

  it.each([-0.01, "-1", Number.MAX_SAFE_INTEGER + 1])(
    "rejects negative or out-of-range decimal input %s",
    (value) => {
      expect(() => toSafeDecimalNumber(value)).toThrow(
        "Persisted decimal value is outside the safe range",
      );
    },
  );
});
