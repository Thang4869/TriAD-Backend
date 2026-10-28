import { describe, expect, it } from "vitest";
import { swaggerSpec } from "@config/swagger";
import { OrderStatus } from "@modules/orders/domain/order-status";
describe("OpenAPI contract", () => {
  it("publishes stable contracts for critical frontend workflows", () => {
    const paths =
      (swaggerSpec as { paths?: Record<string, unknown> }).paths ?? {};
    expect(paths).toEqual(
      expect.objectContaining({
        "/api/products": expect.anything(),
        "/api/auth/refresh": expect.anything(),
        "/api/products/search": expect.anything(),
        "/api/checkout": expect.anything(),
        "/api/checkout/quote": expect.anything(),
        "/api/orders": expect.anything(),
        "/api/admin/dashboard/stats": expect.anything(),
      }),
    );
  });

  it("documents cookie refresh without requiring an access Bearer or body token", () => {
    expect(swaggerSpec).toMatchObject({
      components: {
        securitySchemes: {
          refreshCookie: { type: "apiKey", in: "cookie", name: "refreshToken" },
        },
      },
      paths: {
        "/api/auth/refresh": {
          post: {
            security: [{ refreshCookie: [] }, {}],
            requestBody: {
              required: false,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      refreshToken: { type: "string", minLength: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it("marks checkout read aliases as legacy while retaining canonical order reads", () => {
    const paths =
      (
        swaggerSpec as {
          paths?: Record<string, { get?: { deprecated?: boolean } }>;
        }
      ).paths ?? {};

    expect(paths["/api/checkout/orders"]?.get?.deprecated).toBe(true);
    expect(paths["/api/checkout/orders/{orderId}"]?.get?.deprecated).toBe(true);
    expect(paths["/api/orders"]?.get?.deprecated).not.toBe(true);
    expect(paths["/api/orders/{orderId}"]?.get?.deprecated).not.toBe(true);
  });
  it("keeps admin order list query status enum in sync with OrderStatus", () => {
    const paths =
      (
        swaggerSpec as {
          paths?: Record<
            string,
            {
              get?: {
                parameters?: Array<{
                  name?: string;
                  schema?: { enum?: unknown };
                }>;
              };
            }
          >;
        }
      ).paths ?? {};

    const parameters = paths["/api/orders/admin/all"]?.get?.parameters ?? [];
    const statusParam = parameters.find((param) => param.name === "status");

    expect(statusParam?.schema?.enum).toEqual(Object.values(OrderStatus));
  });

  it("keeps admin order status update body status enum in sync with OrderStatus", () => {
    const paths =
      (
        swaggerSpec as {
          paths?: Record<
            string,
            {
              patch?: {
                requestBody?: {
                  content?: {
                    "application/json"?: {
                      schema?: {
                        properties?: {
                          status?: { enum?: unknown };
                        };
                      };
                    };
                  };
                };
              };
            }
          >;
        }
      ).paths ?? {};

    const statusSchema =
      paths["/api/orders/admin/{orderId}/status"]?.patch?.requestBody
        ?.content?.["application/json"]?.schema?.properties?.status;

    expect(statusSchema?.enum).toEqual(Object.values(OrderStatus));
  });

  it("documents HTTP 409 for invalid admin order status transitions", () => {
    const paths =
      (
        swaggerSpec as {
          paths?: Record<
            string,
            {
              patch?: {
                responses?: Record<string, unknown>;
              };
            }
          >;
        }
      ).paths ?? {};

    expect(
      paths["/api/orders/admin/{orderId}/status"]?.patch?.responses?.["409"],
    ).toMatchObject({
      description: "Trạng thái chuyển đổi không hợp lệ",
    });
  });
});
