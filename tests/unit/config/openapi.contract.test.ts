import { describe, expect, it } from "vitest";
import { swaggerSpec } from "@config/swagger";
import { loginSchema, refreshSchema, registerSchema } from "@modules/auth/dto";
import {
  createProductSchema,
  updateProductSchema,
} from "@modules/products/dto/products.dto";
import { addItemSchema, updateItemSchema } from "@modules/cart/dto/cart.dto";
import { checkoutSchema } from "@modules/checkout/dto/checkout.dto";
import { updateOrderStatusSchema } from "@modules/orders/dto/orders.dto";
import { OrderStatus } from "@modules/orders/domain/order-status";

type Schema = {
  $ref?: string;
  type?: string;
  format?: string;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  oneOf?: Schema[];
  minimum?: number;
  exclusiveMinimum?: boolean | number;
  maximum?: number;
  minLength?: number;
  minItems?: number;
  minProperties?: number;
  pattern?: string;
};

type Response = {
  description?: string;
  content?: { "application/json"?: { schema?: Schema } };
};

type Operation = {
  deprecated?: boolean;
  security?: Array<Record<string, string[]>>;
  parameters?: Array<{
    in?: string;
    name?: string;
    required?: boolean;
    schema?: Schema;
  }>;
  requestBody?: {
    required?: boolean;
    content?: { "application/json"?: { schema?: Schema } };
  };
  responses?: Record<string, Response>;
};

const spec = swaggerSpec as unknown as {
  paths?: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, Schema> };
};
const paths = (spec.paths ?? {}) as Record<string, Record<string, Operation>>;
const components = spec.components ?? {};

function operation(path: string, method: string): Operation {
  const result = paths[path]?.[method];
  if (!result) {
    throw new Error(`${method.toUpperCase()} ${path} is not documented`);
  }
  return result;
}

function requestSchema(path: string, method: string): Schema {
  const schema = operation(path, method).requestBody?.content?.[
    "application/json"
  ]?.schema;
  if (!schema) {
    throw new Error(
      `${method.toUpperCase()} ${path} request schema is missing`,
    );
  }
  return schema;
}

function response(path: string, method: string, status: number): Response {
  const result = operation(path, method).responses?.[String(status)];
  if (!result) {
    throw new Error(
      `${method.toUpperCase()} ${path} response ${status} is missing`,
    );
  }
  return result;
}

function responseSchema(path: string, method: string, status: number): Schema {
  const schema = response(path, method, status).content?.["application/json"]
    ?.schema;
  if (!schema) {
    throw new Error(
      `${method.toUpperCase()} ${path} response ${status} schema is missing`,
    );
  }
  return schema;
}

function expectEnvelope(schema: Schema, dataRequired = true): void {
  expect(schema.type).toBe("object");
  expect(schema.required).toEqual(
    expect.arrayContaining(dataRequired ? ["success", "data"] : ["success"]),
  );
  expect(schema.properties?.success?.enum).toEqual([true]);
}

function expectErrorResponse(path: string, method: string, statuses: number[]) {
  for (const status of statuses) {
    const schema = responseSchema(path, method, status);
    expect(schema.$ref).toBe("#/components/schemas/ErrorResponse");
  }
}

const fixtures = {
  register: {
    email: "customer@example.com",
    password: "password",
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "0123456789",
  },
  login: { email: "customer@example.com", password: "password" },
  refresh: { refreshToken: "refresh-token" },
  product: {
    name: "Pan",
    description: "A durable pan",
    price: 12.5,
    stock: 10,
    category: "cookware",
    images: ["https://example.com/pan.jpg"],
    slug: "durable-pan",
  },
  cartAdd: {
    productId: "cmj5h5b0s0000v7s0m4c0d0e1",
    quantity: 1,
  },
  cartUpdate: {
    productId: "550e8400-e29b-41d4-a716-446655440000",
    quantity: 0,
  },
  checkout: {
    paymentMethod: "COD" as const,
    address: "123 Main Street",
    phone: "0123456789",
    expectedTotal: 1250,
  },
  orderStatus: {
    orderId: "550e8400-e29b-41d4-a716-446655440000",
    status: OrderStatus.PROCESSING,
  },
};

describe("OpenAPI contract", () => {
  it("documents critical paths and methods at their canonical runtime paths", () => {
    const expected: Record<string, string[]> = {
      "/api/auth/register": ["post"],
      "/api/auth/login": ["post"],
      "/api/auth/refresh": ["post"],
      "/api/products/admin": ["post"],
      "/api/products/admin/{id}": ["put"],
      "/api/cart/items": ["post"],
      "/api/cart/items/{productId}": ["put"],
      "/api/checkout": ["post"],
      "/api/orders/admin/{orderId}/status": ["patch"],
    };

    for (const [path, methods] of Object.entries(expected)) {
      for (const method of methods) operation(path, method);
    }
    expect(paths["/api/products/admin/all"]?.post).toBeUndefined();
  });

  it("keeps request schemas compatible with DTO fixtures and constraints", () => {
    registerSchema.parse({ body: fixtures.register });
    loginSchema.parse({ body: fixtures.login });
    refreshSchema.parse({ body: fixtures.refresh });
    createProductSchema.parse({ body: fixtures.product });
    updateProductSchema.parse({
      params: { id: fixtures.cartUpdate.productId },
      body: { price: 15, isActive: true },
    });
    addItemSchema.parse({ body: fixtures.cartAdd });
    updateItemSchema.parse({
      params: { productId: fixtures.cartUpdate.productId },
      body: { quantity: fixtures.cartUpdate.quantity },
    });
    checkoutSchema.parse({ body: fixtures.checkout });
    updateOrderStatusSchema.parse({
      body: { status: fixtures.orderStatus.status },
      params: { orderId: fixtures.orderStatus.orderId },
    });

    const register = requestSchema("/api/auth/register", "post");
    expect(register.required).toEqual(
      expect.arrayContaining(["email", "password", "firstName", "lastName"]),
    );
    expect(register.properties?.email).toMatchObject({
      type: "string",
      format: "email",
    });
    expect(register.properties?.password).toMatchObject({
      type: "string",
      format: "password",
      minLength: 6,
    });
    expect(register.properties?.phone?.type).toBe("string");

    const login = requestSchema("/api/auth/login", "post");
    expect(login.required).toEqual(["email", "password"]);
    expect(login.properties?.password?.minLength).toBe(6);

    const refresh = requestSchema("/api/auth/refresh", "post");
    expect(operation("/api/auth/refresh", "post").requestBody?.required).toBe(
      false,
    );
    expect(refresh.properties?.refreshToken).toMatchObject({
      type: "string",
      minLength: 1,
    });

    const createProduct = requestSchema("/api/products/admin", "post");
    expect(createProduct.required).toEqual(
      expect.arrayContaining(Object.keys(fixtures.product)),
    );
    expect(createProduct.properties?.name).toMatchObject({
      type: "string",
      maxLength: 255,
    });
    expect(createProduct.properties?.price).toMatchObject({
      type: "number",
      minimum: 0,
      exclusiveMinimum: true,
    });
    expect(createProduct.properties?.stock).toMatchObject({
      type: "integer",
      minimum: 0,
    });
    expect(createProduct.properties?.images).toMatchObject({
      type: "array",
      minItems: 1,
    });
    expect(createProduct.properties?.slug).toMatchObject({
      type: "string",
      pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
    });

    const updateProduct = requestSchema("/api/products/admin/{id}", "put");
    expect(updateProduct.minProperties).toBe(1);
    expect(updateProduct.properties?.isActive?.type).toBe("boolean");
    expect(updateProduct.properties?.price?.exclusiveMinimum).toBe(true);

    const addCartItem = requestSchema("/api/cart/items", "post");
    expect(addCartItem.required).toEqual(["productId", "quantity"]);
    expect(addCartItem.properties?.productId?.oneOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ format: "uuid" }),
        expect.objectContaining({ pattern: "^c[a-z0-9]{24}$" }),
      ]),
    );
    expect(addCartItem.properties?.quantity).toMatchObject({
      type: "integer",
      minimum: 1,
    });

    const updateCartItem = requestSchema("/api/cart/items/{productId}", "put");
    expect(updateCartItem.properties?.quantity).toMatchObject({
      type: "integer",
      minimum: 0,
    });
    expect(operation("/api/cart/items/{productId}", "put").parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: "path",
          name: "productId",
          required: true,
        }),
      ]),
    );

    const checkout = requestSchema("/api/checkout", "post");
    expect(checkout.required).toEqual(
      expect.arrayContaining(["paymentMethod", "address", "phone"]),
    );
    expect(checkout.properties?.paymentMethod?.enum).toEqual(["COD"]);
    expect(checkout.properties?.address?.minLength).toBe(5);
    expect(checkout.properties?.phone?.pattern).toBe("^[0-9]{10,11}$");
    expect(checkout.properties?.expectedTotal).toMatchObject({
      type: "integer",
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    });
    expect(operation("/api/checkout", "post").parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: "header",
          name: "Idempotency-Key",
          required: true,
        }),
      ]),
    );

    const status = requestSchema("/api/orders/admin/{orderId}/status", "patch");
    expect(status.required).toEqual(["status"]);
    expect(status.properties?.status?.enum).toEqual(Object.values(OrderStatus));
  });

  it("verifies success envelopes and actual controller status codes", () => {
    expect(response("/api/auth/register", "post", 201)).toBeDefined();
    expectEnvelope(responseSchema("/api/auth/register", "post", 201));
    expectEnvelope(responseSchema("/api/auth/login", "post", 200));
    expectEnvelope(responseSchema("/api/auth/refresh", "post", 200));
    expectEnvelope(responseSchema("/api/products/admin", "post", 201));
    expectEnvelope(responseSchema("/api/products/admin/{id}", "put", 200));
    expectEnvelope(responseSchema("/api/cart/items", "post", 201));
    expectEnvelope(responseSchema("/api/cart/items/{productId}", "put", 200));
    expectEnvelope(responseSchema("/api/checkout", "post", 201));
    expectEnvelope(
      responseSchema("/api/orders/admin/{orderId}/status", "patch", 200),
    );

    expect(
      responseSchema("/api/products/admin", "post", 201).properties?.data,
    ).toBeDefined();
    expect(
      responseSchema("/api/cart/items", "post", 201).properties?.data?.$ref,
    ).toBe("#/components/schemas/CartItem");
  });

  it("documents representative error payloads and statuses", () => {
    expectErrorResponse("/api/auth/register", "post", [400, 409]);
    expectErrorResponse("/api/auth/login", "post", [401]);
    expectErrorResponse("/api/auth/refresh", "post", [400, 401, 403]);
    expectErrorResponse("/api/products/admin", "post", [400]);
    expectErrorResponse("/api/checkout", "post", [400, 409, 422]);
    expectErrorResponse(
      "/api/orders/admin/{orderId}/status",
      "patch",
      [400, 404, 409],
    );

    expect(components.schemas?.ErrorResponse).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["success", "error", "correlationId"]),
    });
  });

  it("keeps shared security, parameters, enums, and deprecation flags synchronized", () => {
    expect(
      components.schemas?.ErrorResponse?.properties?.correlationId?.type,
    ).toBe("string");
    expect(operation("/api/auth/refresh", "post").security).toEqual([
      { refreshCookie: [] },
      {},
    ]);
    expect(operation("/api/auth/refresh", "post").parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: "header",
          name: "x-csrf-token",
          required: false,
          schema: { type: "string" },
        }),
      ]),
    );

    const statusParameter = operation(
      "/api/orders/admin/all",
      "get",
    ).parameters?.find((parameter) => parameter.name === "status");
    expect(statusParameter?.schema?.enum).toEqual(Object.values(OrderStatus));
    expect(
      operation("/api/orders/admin/{orderId}/status", "patch").requestBody
        ?.content?.["application/json"]?.schema?.properties?.status?.enum,
    ).toEqual(Object.values(OrderStatus));

    expect(operation("/api/checkout/orders", "get").deprecated).toBe(true);
    expect(operation("/api/checkout/orders/{orderId}", "get").deprecated).toBe(
      true,
    );
    expect(operation("/api/orders", "get").deprecated).not.toBe(true);
    expect(operation("/api/orders/{orderId}", "get").deprecated).not.toBe(true);
  });

  it("retains critical workflow fixtures as executable DTO examples", () => {
    expect(fixtures.product.images[0]).toMatch(/^https?:\/\//);
    expect(fixtures.checkout.paymentMethod).toBe("COD");
    expect(fixtures.orderStatus.status).toBe(OrderStatus.PROCESSING);
    expect(fixtures.cartAdd.productId).toMatch(/^c[a-z0-9]{24}$/);
    expect(fixtures.cartUpdate.quantity).toBe(0);
  });
});
