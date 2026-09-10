import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { Product } from "@/modules/products/domain/product.entity";

function freshProduct(initialStock: number): Product {
  return Product.hydrate({
    id: "p1",
    name: "Test product",
    description: null,
    price: 10_000,
    stock: initialStock,
    category: "test",
    images: [],
    slug: "test-product",
    isActive: true,
  });
}

type StockOp =
  { kind: "increase"; amount: number } | { kind: "reduce"; amount: number };

const stockOpArb: fc.Arbitrary<StockOp> = fc.oneof(
  fc.record({
    kind: fc.constant("increase" as const),
    amount: fc.integer({ min: 1, max: 500 }),
  }),
  fc.record({
    kind: fc.constant("reduce" as const),
    amount: fc.integer({ min: 1, max: 500 }),
  }),
);

describe("Product stock (property-based)", () => {
  it("stock is never negative, no matter the sequence of increase/reduce calls", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.array(stockOpArb, { minLength: 0, maxLength: 50 }),
        (initialStock, ops) => {
          const product = freshProduct(initialStock);
          let expected = initialStock;

          for (const op of ops) {
            if (op.kind === "increase") {
              product.increaseStock(op.amount);
              expected += op.amount;
            } else {
              if (op.amount > expected) {
                expect(() => product.reduceStock(op.amount)).toThrow();
                // Rejected operation must not mutate state.
                expect(product.stock).toBe(expected);
              } else {
                product.reduceStock(op.amount);
                expected -= op.amount;
              }
            }
          }

          expect(product.stock).toBe(expected);
          expect(product.stock).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it("reduceStock always rejects non-positive amounts and never mutates stock", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: -100, max: 0 }),
        (initialStock, amount) => {
          const product = freshProduct(initialStock);
          expect(() => product.reduceStock(amount)).toThrow();
          expect(product.stock).toBe(initialStock);
        },
      ),
    );
  });
});
