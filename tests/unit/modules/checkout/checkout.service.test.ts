import { describe, it, expect, vi, beforeEach } from "vitest";
import { CheckoutService } from "@modules/checkout/checkout.service";
import { ICheckoutRepository } from "@modules/checkout/checkout.repository";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@shared/utils/errors";

vi.mock("@core/redis/client", () => ({
  default: { get: vi.fn(), setex: vi.fn() },
}));

vi.mock("@core/queue/bull", () => ({
  emailQueue: { add: vi.fn().mockResolvedValue({}) },
}));

const discount = {
  id: "d1",
  code: "SAVE10",
  isActive: true,
  expiresAt: null,
  minOrderAmount: null,
  maxUses: null,
  usedCount: 0,
  type: "PERCENTAGE" as const,
  value: 10,
};

const baseInput = {
  idempotencyKey: "idem-1",
  paymentMethod: "COD" as const,
  address: "123 Main St",
  phone: "0123456789",
};

const baseUser = {
  id: "user-1",
  email: "user@test.com",
  firstName: "John",
  lastName: "Doe",
  phone: "0123456789",
  cart: {
    id: "cart-1",
    userId: "user-1",
    items: [
      {
        productId: "prod-1",
        quantity: 2,
        product: { id: "prod-1", name: "Glass", price: 100, stock: 10 },
      },
    ],
  },
};

function createFakeRepository(
  overrides: Partial<ICheckoutRepository> = {},
): ICheckoutRepository {
  const defaultLocked = [
    {
      id: baseUser.cart.items[0].productId,
      stock: baseUser.cart.items[0].product.stock,
      version: 0,
      name: baseUser.cart.items[0].product.name,
      price: baseUser.cart.items[0].product.price,
    },
  ];
  return {
    findCachedOrderId: vi.fn().mockResolvedValue(null),
    cacheOrderId: vi.fn().mockResolvedValue(undefined),
    findOrderWithItems: vi.fn().mockResolvedValue(null),
    findUserCartForCheckout: vi.fn().mockResolvedValue(null),
    runInTransaction: vi.fn().mockImplementation(async (fn) => fn({} as any)),
    lockProductsForUpdate: vi.fn().mockResolvedValue(defaultLocked),
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
    ...overrides,
  };
}

const mockEmailService = {
  sendOrderConfirmation: vi.fn().mockResolvedValue(undefined),
};

describe("CheckoutService", () => {
  let repository: ICheckoutRepository;
  let service: CheckoutService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = createFakeRepository();
    service = new CheckoutService(repository, mockEmailService as any);
  });

  describe("checkout", () => {
    it("throws if cart is empty", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue({
        ...baseUser,
        cart: { ...baseUser.cart, items: [] },
      });
      await expect(service.checkout("user-1", baseInput)).rejects.toThrow(
        BadRequestError,
      );
    });

    it("returns idempotent result if cached", async () => {
      repository.findCachedOrderId = vi.fn().mockResolvedValue("order-1");
      repository.findOrderWithItems = vi
        .fn()
        .mockResolvedValue({ id: "order-1" });
      const result = await service.checkout("user-1", baseInput);
      expect(result).toHaveProperty("idempotent", true);
      expect(repository.findUserCartForCheckout).not.toHaveBeenCalled();
    });

    it("applies free shipping if subtotal > threshold", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue({
        ...baseUser,
        cart: {
          ...baseUser.cart,
          items: [
            {
              ...baseUser.cart.items[0],
              quantity: 10,
              product: { ...baseUser.cart.items[0].product, price: 60000 },
            },
          ],
        },
      });
      repository.lockProductsForUpdate = vi.fn().mockResolvedValue([
        {
          id: baseUser.cart.items[0].productId,
          stock: 10,
          version: 0,
          name: "Glass",
          price: 60000,
        },
      ]);
      await service.checkout("user-1", baseInput);
      expect(repository.createOrder).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ shippingFee: 0 }),
      );
    });

    it("applies discount code correctly", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
      repository.findDiscountByCode = vi.fn().mockResolvedValue(discount);
      repository.incrementDiscountUsage = vi.fn().mockResolvedValue(true);
      await service.checkout("user-1", {
        ...baseInput,
        discountCode: "SAVE10",
      });
      expect(repository.createOrder).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ discountAmount: expect.any(Number) }),
      );
    });

    it("throws if discount code is inactive", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
      repository.findDiscountByCode = vi
        .fn()
        .mockResolvedValue({ ...discount, isActive: false });
      await expect(
        service.checkout("user-1", { ...baseInput, discountCode: "INACTIVE" }),
      ).rejects.toThrow(BadRequestError);
    });

    it("throws if discount code expired", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
      repository.findDiscountByCode = vi.fn().mockResolvedValue({
        ...discount,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.checkout("user-1", { ...baseInput, discountCode: "EXPIRED" }),
      ).rejects.toThrow(BadRequestError);
    });

    it("throws if order amount below minOrderAmount", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
      repository.findDiscountByCode = vi
        .fn()
        .mockResolvedValue({ ...discount, minOrderAmount: 500 });
      await expect(
        service.checkout("user-1", { ...baseInput, discountCode: "MIN" }),
      ).rejects.toThrow(BadRequestError);
    });

    it("throws if discount usage limit reached", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
      repository.findDiscountByCode = vi
        .fn()
        .mockResolvedValue({ ...discount, maxUses: 1, usedCount: 1 });
      repository.incrementDiscountUsage = vi.fn().mockResolvedValue(false);
      await expect(
        service.checkout("user-1", { ...baseInput, discountCode: "USED" }),
      ).rejects.toThrow(ConflictError);
    });

    it("retries on stock conflict", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
      let callCount = 0;
      repository.runInTransaction = vi.fn().mockImplementation(async (fn) => {
        callCount++;
        if (callCount === 1) throw new ConflictError("stock conflict");
        return fn({} as any);
      });
      repository.decrementProductStock = vi.fn().mockResolvedValue(true);
      const result = await service.checkout("user-1", baseInput);
      expect(result.order.id).toBeDefined();
      expect(callCount).toBe(2);
    });

    it("caches order id after success", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
      await service.checkout("user-1", baseInput);
      expect(repository.cacheOrderId).toHaveBeenCalledWith(
        baseInput.idempotencyKey,
        "order-1",
        expect.any(Number),
      );
    });

    it("sends order confirmation email", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
      await service.checkout("user-1", baseInput);
      expect(mockEmailService.sendOrderConfirmation).toHaveBeenCalled();
    });
  });

  describe("getOrder", () => {
    it("throws if order not found", async () => {
      repository.findOrderByUserAndId = vi.fn().mockResolvedValue(null);
      await expect(service.getOrder("order-1", "user-1")).rejects.toThrow(
        NotFoundError,
      );
    });

    it("returns order if found", async () => {
      const order = { id: "order-1" };
      repository.findOrderByUserAndId = vi.fn().mockResolvedValue(order);
      const result = await service.getOrder("order-1", "user-1");
      expect(result).toBe(order);
    });
  });

  describe("getOrders", () => {
    it("returns paginated orders", async () => {
      repository.findOrdersByUser = vi.fn().mockResolvedValue([{ id: "o1" }]);
      repository.countOrdersByUser = vi.fn().mockResolvedValue(1);
      const result = await service.getOrders("user-1", 1, 10);
      expect(result.orders).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });
});
