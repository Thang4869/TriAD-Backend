import { describe, expect, it } from "vitest";
import { CryptoOrderNumberGenerator } from "@modules/checkout/infrastructure/order-number-generator";
import { OrderNumber } from "@shared/value-objects/order-number";

describe("CryptoOrderNumberGenerator", () => {
  const generator = new CryptoOrderNumberGenerator();

  it("generates a valid order number", () => {
    const orderNumber = generator.generate();

    expect(orderNumber).toMatch(/^ORD-[A-F0-9]{32}$/);
    expect(() => new OrderNumber(orderNumber)).not.toThrow();
  });

  it("generates unique order numbers", () => {
    const generated = new Set(
      Array.from({ length: 1000 }, () => generator.generate()),
    );

    expect(generated.size).toBe(1000);
  });
});
