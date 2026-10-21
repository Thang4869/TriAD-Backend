import { describe, expect, it } from "vitest";
import { addItemSchema, updateItemSchema } from "@modules/cart/dto/cart.dto";

const uuid = "5eb6bfc1-940a-4d16-8d86-7dc5f577f101";
const cuid = "clh5cnxs10000h0n5d4dqxwds";

describe("cart product identifiers", () => {
  it.each([uuid, cuid])(
    "accepts %s for adding and updating an item",
    (productId) => {
      expect(
        addItemSchema.parse({ body: { productId, quantity: 1 } }).body
          .productId,
      ).toBe(productId);
      expect(
        updateItemSchema.parse({ params: { productId }, body: { quantity: 0 } })
          .params.productId,
      ).toBe(productId);
    },
  );

  it.each([
    "",
    "product-1",
    "staging_catalog_glass_1000ml_v1",
    "5eb6bfc1-940a-4d16-8d86-invalid",
    123,
    null,
    undefined,
  ])("rejects an invalid product identifier: %s", (productId) => {
    for (const result of [
      addItemSchema.safeParse({ body: { productId, quantity: 1 } }),
      updateItemSchema.safeParse({
        params: { productId },
        body: { quantity: 1 },
      }),
    ]) {
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues[0].message).toBe("Invalid product ID");
    }
  });

  it.each([0, -1, 1.5])(
    "still rejects an invalid add quantity: %s",
    (quantity) => {
      expect(
        addItemSchema.safeParse({ body: { productId: uuid, quantity } })
          .success,
      ).toBe(false);
    },
  );

  it.each([-1, 1.5])(
    "still rejects an invalid update quantity: %s",
    (quantity) => {
      expect(
        updateItemSchema.safeParse({
          params: { productId: uuid },
          body: { quantity },
        }).success,
      ).toBe(false);
    },
  );
});
