import { describe, expect, it } from "vitest";
import { getOrdersQuerySchema } from "@modules/checkout/dto/checkout.dto";
import {
  adminGetOrdersQuerySchema,
  getMyOrdersQuerySchema,
} from "@modules/orders/dto/orders.dto";
import {
  adminGetProductsQuerySchema,
  searchProductsQuerySchema,
} from "@modules/products/dto/products.dto";
import {
  adminGetAllReviewsQuerySchema,
  getReviewsQuerySchema,
} from "@modules/reviews/dto/reviews.dto";
import { getNotificationsQuerySchema } from "@modules/notifications/dto/notifications.dto";
import { getWishlistQuerySchema } from "@modules/wishlist/dto/wishlist.dto";

const schemas = [
  ["checkout orders", getOrdersQuerySchema, 10],
  ["admin orders", adminGetOrdersQuerySchema, 10],
  ["my orders", getMyOrdersQuerySchema, 10],
  ["admin products", adminGetProductsQuerySchema, 20],
  ["product search", searchProductsQuerySchema, 12],
  ["admin reviews", adminGetAllReviewsQuerySchema, 10],
  ["product reviews", getReviewsQuerySchema, 10],
  ["notifications", getNotificationsQuerySchema, 10],
  ["wishlist", getWishlistQuerySchema, 20],
] as const;

const params = { productId: "5eb6bfc1-940a-4d16-8d86-7dc5f577f101" };

describe.each(schemas)("Zod 4 pagination: %s", (_name, schema, limit) => {
  it("applies numeric defaults before string conversion", () => {
    expect(schema.parse({ query: { q: "glass" }, params }).query).toMatchObject(
      { page: 1, limit },
    );
  });

  it("converts explicit pagination and rejects invalid values", () => {
    expect(
      schema.parse({ query: { q: "glass", page: "2", limit: "5" }, params })
        .query,
    ).toMatchObject({ page: 2, limit: 5 });
    for (const query of [
      { page: "0" },
      { page: "1.5" },
      { page: "NaN" },
      { limit: "51" },
      { limit: "" },
      { page: ["1", "2"] },
    ]) {
      expect(
        schema.safeParse({ query: { q: "glass", ...query }, params }).success,
      ).toBe(false);
    }
  });
});
