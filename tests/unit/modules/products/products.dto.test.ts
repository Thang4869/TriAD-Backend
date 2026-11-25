import { describe, expect, it } from "vitest";
import { adminGetProductsQuerySchema } from "@modules/products/dto/products.dto";

describe("adminGetProductsQuerySchema", () => {
  it("leaves isActive undefined when the filter is omitted", () => {
    const result = adminGetProductsQuerySchema.parse({ query: {} });

    expect(result.query.isActive).toBeUndefined();
  });

  it.each([
    ["true", true],
    ["false", false],
  ] as const)("transforms isActive=%s into %s", (input, expected) => {
    const result = adminGetProductsQuerySchema.parse({
      query: { isActive: input },
    });

    expect(result.query.isActive).toBe(expected);
  });
});
