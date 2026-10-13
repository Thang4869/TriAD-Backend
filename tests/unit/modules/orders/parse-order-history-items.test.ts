import { describe, expect, it } from "vitest";
import { parseOrderHistoryItems } from "@modules/orders/infrastructure/repositories/parse-order-history-items";

describe("parseOrderHistoryItems", () => {
  it("accepts a valid persisted item snapshot", () => {
    expect(parseOrderHistoryItems([
      { productId: "p-1", productName: "Product", quantity: 2, unitPrice: 120 },
    ])).toEqual([
      { productId: "p-1", productName: "Product", quantity: 2, unitPrice: 120 },
    ]);
  });

  it("allows an empty snapshot for a legacy order", () => {
    expect(parseOrderHistoryItems([])).toEqual([]);
  });

  it.each([
    null,
    { productId: "p-1" },
    [{ productId: "p-1", productName: "Product", quantity: 0, unitPrice: 10 }],
    [{ productId: "p-1", productName: "Product", quantity: 1, unitPrice: -5 }],
    [{ productId: "p-1", quantity: 1, unitPrice: 50 }],
  ])("rejects corrupt projection JSON instead of returning an unsafe view", (value) => {
    expect(() => parseOrderHistoryItems(value)).toThrow(
      "Invalid order history projection items",
    );
  });
});
