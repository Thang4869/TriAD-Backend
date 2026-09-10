import { describe, it, expect, vi } from "vitest";
import { CheckoutService } from "../../src/modules/checkout/checkout.service";
import { ICheckoutRepository } from "../../src/modules/checkout/checkout.repository";
import { PricingService } from "../../src/modules/checkout/domain/pricing.service";
import { StockReservationService } from "@/modules/checkout/services/stock-reservation.service";
import { IdempotencyService } from "@/modules/checkout/services/idempotency.service";
import { ConflictError } from "@shared/utils/errors";

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

describe("Checkout Concurrency", () => {
  it("should prevent overselling with concurrent requests", async () => {
    const orderId = "order-1";
    const mockOrder = { id: orderId, items: [] };

    const repository = {
      findCachedOrderId: vi.fn().mockResolvedValue(null),
      cacheOrderId: vi.fn().mockResolvedValue(undefined),
      findOrderWithItems: vi.fn().mockResolvedValue(mockOrder),
      findUserCartForCheckout: vi.fn().mockImplementation(async (userId) => ({
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
              productId: "test-product",
              quantity: 1,
              product: {
                id: "test-product",
                name: "Test Product",
                price: 100000,
                stock: 1,
                version: 0,
              },
            },
          ],
        },
      })),
      runInTransaction: vi.fn().mockResolvedValue({}),
      findDiscountByCode: vi.fn().mockResolvedValue(null),
      incrementDiscountUsage: vi.fn().mockResolvedValue(true),
      saveNewOrder: vi.fn().mockResolvedValue({ id: orderId }),
      clearCartItems: vi.fn().mockResolvedValue(undefined),
      createOrder: vi.fn(),
      createOrderItems: vi.fn(),
      findOrdersByUser: vi.fn(),
      countOrdersByUser: vi.fn(),
      findOrderByUserAndId: vi.fn(),
    } as unknown as ICheckoutRepository;

    const pricingService = {
      calculatePricing: vi.fn().mockResolvedValue({
        tax: { getValue: () => 0 },
        shippingFee: { getValue: () => 0 },
        discountAmount: { getValue: () => 0 },
        discountCode: undefined,
      }),
    } as unknown as PricingService;

    const stockService = {
      reserveStock: vi.fn().mockResolvedValue(undefined),
    } as unknown as StockReservationService;

    const idempotencyService = {
      tryReturnIdempotentOrder: vi.fn().mockResolvedValue(null),
      cacheOrderId: vi.fn().mockResolvedValue(undefined),
    } as unknown as IdempotencyService;

    const checkoutService = new CheckoutService(
      repository,
      pricingService,
      stockService,
      idempotencyService,
    );

    const mockOrderEntity = {
      id: orderId,
      orderNumber: "ORD-1",
      total: { getValue: () => 100_000 },
    };

    (checkoutService as any).executeWithRetry = vi
      .fn()
      .mockResolvedValueOnce(mockOrderEntity)
      .mockRejectedValueOnce(new ConflictError("Stock conflict"));

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

    const results = await Promise.allSettled(requests);

    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failCount = results.filter((r) => r.status === "rejected").length;

    expect(successCount).toBe(1);
    expect(failCount).toBe(1);
  });
});
