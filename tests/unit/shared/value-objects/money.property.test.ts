import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { Money } from "@shared/value-objects/money";

// Property-based tests complement the example-based unit tests: instead of
// asserting Money behaves correctly for a handful of hand-picked numbers,
// we assert invariants that must hold for *every* input fast-check can
// generate, including edge cases a human wouldn't think to write by hand
// (very large amounts, amounts that round awkwardly, zero, etc).

const nonNegativeAmount = fc.integer({ min: 0, max: 1_000_000_000 });

describe("Money (property-based)", () => {
  it("never exposes a negative value, for any non-negative constructor input", () => {
    fc.assert(
      fc.property(nonNegativeAmount, (amount) => {
        expect(new Money(amount).getValue()).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("rejects every negative amount", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000_000, max: -1 }), (amount) => {
        expect(() => new Money(amount)).toThrow();
      }),
    );
  });

  it("add() is commutative: a.add(b) === b.add(a)", () => {
    fc.assert(
      fc.property(nonNegativeAmount, nonNegativeAmount, (a, b) => {
        const left = new Money(a).add(new Money(b)).getValue();
        const right = new Money(b).add(new Money(a)).getValue();
        expect(left).toBe(right);
      }),
    );
  });

  it("add() is associative: (a+b)+c === a+(b+c)", () => {
    fc.assert(
      fc.property(
        nonNegativeAmount,
        nonNegativeAmount,
        nonNegativeAmount,
        (a, b, c) => {
          const left = new Money(a)
            .add(new Money(b))
            .add(new Money(c))
            .getValue();
          const right = new Money(a)
            .add(new Money(b).add(new Money(c)))
            .getValue();
          expect(left).toBe(right);
        },
      ),
    );
  });

  it("a.add(b).subtract(b) === a, for any a >= 0, b >= 0", () => {
    fc.assert(
      fc.property(nonNegativeAmount, nonNegativeAmount, (a, b) => {
        const roundTrip = new Money(a)
          .add(new Money(b))
          .subtract(new Money(b))
          .getValue();
        expect(roundTrip).toBe(Math.round(a));
      }),
    );
  });

  it("subtract() throws instead of ever producing a negative Money", () => {
    fc.assert(
      fc.property(nonNegativeAmount, nonNegativeAmount, (a, b) => {
        const smaller = new Money(Math.min(a, b));
        const larger = new Money(Math.max(a, b));
        if (a === b) {
          expect(larger.subtract(smaller).getValue()).toBe(0);
        } else {
          expect(() => smaller.subtract(larger)).toThrow();
        }
      }),
    );
  });

  it("multiply(n) is equivalent to n additions of the same Money", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 0, max: 20 }),
        (amount, factor) => {
          const money = new Money(amount);
          const viaMultiply = money.multiply(factor).getValue();
          let viaRepeatedAdd = new Money(0);
          for (let i = 0; i < factor; i++)
            viaRepeatedAdd = viaRepeatedAdd.add(money);
          expect(viaMultiply).toBe(viaRepeatedAdd.getValue());
        },
      ),
    );
  });

  it("lessThan() is a strict total order consistent with getValue()", () => {
    fc.assert(
      fc.property(nonNegativeAmount, nonNegativeAmount, (a, b) => {
        const result = new Money(a).lessThan(new Money(b));
        expect(result).toBe(Math.round(a) < Math.round(b));
      }),
    );
  });
});
