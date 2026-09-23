import { describe, expect, it } from "vitest";
import { swaggerSpec } from "@config/swagger";

describe("OpenAPI contract", () => {
  it("publishes stable contracts for critical frontend workflows", () => {
    const paths =
      (swaggerSpec as { paths?: Record<string, unknown> }).paths ?? {};
    expect(paths).toEqual(
      expect.objectContaining({
        "/api/products": expect.anything(),
        "/api/products/search": expect.anything(),
        "/api/checkout": expect.anything(),
        "/api/orders": expect.anything(),
        "/api/admin/dashboard/stats": expect.anything(),
      }),
    );
  });
});
