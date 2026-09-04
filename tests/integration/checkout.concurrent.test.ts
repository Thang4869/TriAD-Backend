import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { CheckoutService } from "../../src/modules/checkout/checkout.service";
import { ICheckoutRepository } from "../../src/modules/checkout/checkout.repository";

vi.mock("@core/redis/client", () => ({
  default: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue("OK"),
  },
}));

vi.mock("@core/queue/bull", () => ({
  emailQueue: {
    add: vi.fn().mockResolvedValue({}),
  },
}));

const mockRepository: ICheckoutRepository = {
  findCachedOrderId: vi.fn().mockResolvedValue(null),
  cacheOrderId: vi.fn().mockResolvedValue(undefined),
  findOrderWithItems: vi.fn().mockResolvedValue(null),
  findUserCartForCheckout: vi.fn().mockImplementation(async (userId) => {
    return {
      id: userId,
      email: `${userId}@test.com`,
      firstName: "Test",
      lastName: "User",
      phone: "0123456789",
      cart: {
        id: `cart-${userId}`,
        userId,
        items: [
          {
            productId: "test-product-concurrency",
            quantity: 1,
            product: {
              id: "test-product-concurrency",
              name: "Test Product",
              price: 100000,
              stock: 1,
              version: 0,
            },
          },
        ],
      },
    };
  }),
  runInTransaction: vi.fn().mockImplementation(async (fn) => {
    const tx = {} as any;
    return fn(tx);
  }),
  lockProductsForUpdate: vi.fn().mockResolvedValue([
    {
      id: "test-product-concurrency",
      stock: 1,
      version: 0,
      name: "Test Product",
      price: 100000,
    },
  ]),
  decrementProductStock: vi.fn().mockResolvedValue(true),
  findDiscountByCode: vi.fn().mockResolvedValue(null),
  incrementDiscountUsage: vi.fn().mockResolvedValue(true),
  createOrder: vi
    .fn()
    .mockResolvedValue({ id: "order-1", orderNumber: "ORD-123" }),
  createOrderItems: vi.fn().mockResolvedValue(undefined),
  clearCartItems: vi.fn().mockResolvedValue(undefined),
  findOrdersByUser: vi.fn().mockResolvedValue([]),
  countOrdersByUser: vi.fn().mockResolvedValue(0),
  findOrderByUserAndId: vi.fn().mockResolvedValue(null),
};

describe("Checkout Concurrency", () => {
  const mockEmailService = {
    sendOrderConfirmation: vi.fn().mockResolvedValue(undefined),
  };

  const checkoutService = new CheckoutService(
    mockRepository,
    mockEmailService as any,
  );

  beforeAll(async () => {});

  afterAll(async () => {});

  it("should prevent overselling with concurrent requests", async () => {
    // Mock order retrieval to succeed after creation
    mockRepository.findOrderWithItems = vi.fn().mockResolvedValue({
      id: "order-1",
      items: [],
    });

    const requests = [
      checkoutService.checkout("user-a", {
        idempotencyKey: "idem-a",
        paymentMethod: "COD",
        address: "Address A",
        phone: "0123456789",
      }),
      checkoutService.checkout("user-b", {
        idempotencyKey: "idem-b",
        paymentMethod: "COD",
        address: "Address B",
        phone: "0987654321",
      }),
    ];

    let callCount = 0;
    mockRepository.decrementProductStock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(true);
      return Promise.resolve(false);
    });

    const results = await Promise.allSettled(requests);

    const successCount = results.filter((r) => r.status === "fulfilled").length;

    const failCount = results.filter((r) => r.status === "rejected").length;

    expect(successCount).toBe(1);
    expect(failCount).toBe(1);
  });
});
