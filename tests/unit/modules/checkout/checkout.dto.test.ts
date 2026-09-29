import { describe, expect, it } from "vitest";
import { checkoutSchema } from "@modules/checkout/dto/checkout.dto";

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
