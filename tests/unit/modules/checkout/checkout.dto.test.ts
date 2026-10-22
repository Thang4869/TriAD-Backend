import { describe, expect, it } from "vitest";
import {
  checkoutSchema,
  checkoutQuoteSchema,
} from "@modules/checkout/dto/checkout.dto";

describe("checkoutSchema", () => {
  const validCheckout = {
    body: {
      paymentMethod: "COD",
      address: "123 Main St",
      phone: "0123456789",
    },
  };

  it("accepts COD payment", () => {
    const result = checkoutSchema.safeParse(validCheckout);

    expect(result.success).toBe(true);
  });

  it("preserves the reviewed total in integer VND", () => {
    const result = checkoutSchema.parse({
      body: { ...validCheckout.body, expectedTotal: 195000 },
    });
    expect(result.body.expectedTotal).toBe(195000);
  });

  it.each([-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid reviewed total %s",
    (expectedTotal) => {
      expect(
        checkoutSchema.safeParse({
          body: { ...validCheckout.body, expectedTotal },
        }).success,
      ).toBe(false);
    },
  );

  it("validates a quote without requiring checkout contact information", () => {
    expect(
      checkoutQuoteSchema.parse({ query: { discountCode: "  SAVE10  " } }),
    ).toEqual({ query: { discountCode: "SAVE10" } });
    expect(checkoutQuoteSchema.safeParse({ query: {} }).success).toBe(true);
    expect(
      checkoutQuoteSchema.safeParse({ query: { discountCode: [] } }).success,
    ).toBe(false);
  });

  it("rejects CARD payment until a payment gateway is integrated", () => {
    const result = checkoutSchema.safeParse({
      body: {
        ...validCheckout.body,
        paymentMethod: "CARD",
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects BANKING payment until a payment gateway is integrated", () => {
    const result = checkoutSchema.safeParse({
      body: {
        ...validCheckout.body,
        paymentMethod: "BANKING",
      },
    });

    expect(result.success).toBe(false);
  });
});
