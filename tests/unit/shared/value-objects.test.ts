import { describe, expect, it } from "vitest";
import { Address } from "@shared/value-objects/address";
import { Email } from "@shared/value-objects/email";
import { Money } from "@shared/value-objects/money";
import { OrderNumber } from "@shared/value-objects/order-number";
import { PhoneNumber } from "@shared/value-objects/phone-number";
import { Rating } from "@shared/value-objects/rating";

describe("value objects", () => {
  it("normalizes and validates contact and order identity values", () => {
    expect(new Email(" User@Example.COM ").getValue()).toBe("user@example.com");
    expect(new Email("a@example.com").equals(new Email("a@example.com"))).toBe(
      true,
    );
    expect(new Email("a@example.com").equals(new Email("b@example.com"))).toBe(
      false,
    );
    expect(new PhoneNumber("0900-000-000").getValue()).toBe("0900000000");
    expect(new PhoneNumber("").getValue()).toBe("");
    expect(new Address("  123   Main St ").getValue()).toBe("123 Main St");
    expect(new OrderNumber(" ord-0001 ").getValue()).toBe("ORD-0001");
    expect(new Address("123 Main St").toString()).toBe("123 Main St");
    expect(new Email("a@example.com").toString()).toBe("a@example.com");
    expect(new OrderNumber("ORD-0001").toString()).toBe("ORD-0001");
    expect(new PhoneNumber("0900000000").toString()).toBe("0900000000");
  });

  it("rejects invalid identity values", () => {
    expect(() => new Email("invalid")).toThrow();
    expect(() => new PhoneNumber("abc")).toThrow();
    expect(() => new Address(" ")).toThrow();
    expect(() => new OrderNumber("bad value")).toThrow();
  });

  it("rejects values that only become valid when a regex is not anchored", () => {
    expect(() => new Email("valid@example.com trailing")).toThrow(
      "Invalid email address",
    );
    expect(() => new Email("prefix valid@example.com")).toThrow(
      "Invalid email address",
    );
    expect(() => new OrderNumber("ORD-0001 trailing")).toThrow(
      "Invalid order number",
    );
    expect(() => new OrderNumber("prefix ORD-0001")).toThrow(
      "Invalid order number",
    );
    expect(() => new PhoneNumber("0900000000abc")).toThrow(
      "Invalid phone number",
    );
    expect(() => new PhoneNumber("abc0900000000")).toThrow(
      "Invalid phone number",
    );
    expect(new PhoneNumber(" 0900-000-000 ").getValue()).toBe("0900000000");
  });

  it("rejects an address at the maximum invalid length", () => {
    expect(new Address("a".repeat(499)).getValue()).toHaveLength(499);
    expect(new Address("a".repeat(500)).getValue()).toHaveLength(500);
    expect(() => new Address("a".repeat(501))).toThrow("Invalid address");
  });

  it("preserves Money and Rating invariants", () => {
    expect(new Money(100).add(new Money(50)).getValue()).toBe(150);
    expect(new Money(100).subtract(new Money(50)).getValue()).toBe(50);
    expect(new Money(100).multiply(2).getValue()).toBe(200);
    expect(() => new Money(-1)).toThrow();
    expect(() => new Money(100, "USDx")).toThrow("Invalid currency");
    expect(() => new Money(100, "xUSD")).toThrow("Invalid currency");
    expect(() => new Money(1, "USD").add(new Money(1))).toThrow();
    expect(new Money(100).lessThan(new Money(100))).toBe(false);
    expect(
      Rating.fromReviews([{ rating: 4 }, { rating: 5 }]).getAverage(),
    ).toBe(4.5);
    expect(Rating.fromReviews([]).getCount()).toBe(0);
  });
});
