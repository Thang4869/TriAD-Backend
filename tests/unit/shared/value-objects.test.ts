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
    expect(new PhoneNumber("0900-000-000").getValue()).toBe("0900000000");
    expect(new PhoneNumber("").getValue()).toBe("");
    expect(new Address("  123   Main St ").getValue()).toBe("123 Main St");
    expect(new OrderNumber(" ord-0001 ").getValue()).toBe("ORD-0001");
  });

  it("rejects invalid identity values", () => {
    expect(() => new Email("invalid")).toThrow();
    expect(() => new PhoneNumber("abc")).toThrow();
    expect(() => new Address(" ")).toThrow();
    expect(() => new OrderNumber("bad value")).toThrow();
  });

  it("preserves Money and Rating invariants", () => {
    expect(new Money(100).add(new Money(50)).getValue()).toBe(150);
    expect(new Money(100).subtract(new Money(50)).getValue()).toBe(50);
    expect(new Money(100).multiply(2).getValue()).toBe(200);
    expect(() => new Money(-1)).toThrow();
    expect(() => new Money(1, "USD").add(new Money(1))).toThrow();
    expect(
      Rating.fromReviews([{ rating: 4 }, { rating: 5 }]).getAverage(),
    ).toBe(4.5);
    expect(Rating.fromReviews([]).getCount()).toBe(0);
  });
});
