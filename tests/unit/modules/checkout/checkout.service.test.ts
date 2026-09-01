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

  it("should handle checkout without idempotency key (covers line 107)", async () => {
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    const inputWithoutIdempotency = { ...baseInput, idempotencyKey: "" };
    await service.checkout("user-1", inputWithoutIdempotency);
    expect(repository.cacheOrderId).not.toHaveBeenCalled();
  });

  it("should return idempotent response when cached order exists and order found (covers line 148)", async () => {
    repository.findCachedOrderId = vi.fn().mockResolvedValue("order-1");
    repository.findOrderWithItems = vi
      .fn()
      .mockResolvedValue({ id: "order-1" });
    const result = await service.checkout("user-1", baseInput);
    expect(result.idempotent).toBe(true);
    expect(result.order).toEqual({ id: "order-1" });
    expect(repository.findUserCartForCheckout).not.toHaveBeenCalled();
  });

  it("should apply percentage discount correctly (covers discount branch)", async () => {
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    const discountPercent = { ...discount, type: "PERCENTAGE", value: 20 };
    repository.findDiscountByCode = vi.fn().mockResolvedValue(discountPercent);
    repository.incrementDiscountUsage = vi.fn().mockResolvedValue(true);
    await service.checkout("user-1", { ...baseInput, discountCode: "SAVE20" });
    expect(repository.createOrder).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ discountAmount: 40 }),
    );
  });

  it("should handle discount code with maxUses and not exceed limit (covers maxUses branch)", async () => {
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    const discountLimited = { ...discount, maxUses: 2, usedCount: 1 };
    repository.findDiscountByCode = vi.fn().mockResolvedValue(discountLimited);
    repository.incrementDiscountUsage = vi.fn().mockResolvedValue(true);
    await service.checkout("user-1", { ...baseInput, discountCode: "LIMITED" });
    expect(repository.incrementDiscountUsage).toHaveBeenCalledWith(
      expect.any(Object),
      discountLimited.id,
      2,
    );
  });

  it("throws ConflictError when decrementProductStock fails due to version mismatch (covers line 190)", async () => {
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    repository.decrementProductStock = vi.fn().mockResolvedValue(false);
    repository.runInTransaction = vi
      .fn()
      .mockImplementation(async (fn) => fn({} as any));
    await expect(service.checkout("user-1", baseInput)).rejects.toThrow(
      ConflictError,
    );
    expect(repository.decrementProductStock).toHaveBeenCalled();
  });

  it("throws ConflictError after exhausting all retries", async () => {
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    let callCount = 0;
    repository.runInTransaction = vi.fn().mockImplementation(async () => {
      callCount++;
      throw new ConflictError("stock conflict");
    });
    await expect(service.checkout("user-1", baseInput)).rejects.toThrow(
      ConflictError,
    );
    expect(callCount).toBe(6);
  });

  it("throws non-ConflictError immediately without retrying", async () => {
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    const nonConflictError = new BadRequestError("some other error");
    repository.runInTransaction = vi.fn().mockRejectedValue(nonConflictError);
    await expect(service.checkout("user-1", baseInput)).rejects.toThrow(
      BadRequestError,
    );
    expect(repository.runInTransaction).toHaveBeenCalledTimes(1);
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

    it("throws NotFoundError if a cart product is missing from the locked products", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
      repository.lockProductsForUpdate = vi.fn().mockResolvedValue([]);
      await expect(service.checkout("user-1", baseInput)).rejects.toThrow(
        NotFoundError,
      );
    });

    it("throws BadRequestError when locked stock is not enough for the requested quantity", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
      repository.lockProductsForUpdate = vi.fn().mockResolvedValue([
        {
          id: baseUser.cart.items[0].productId,
          stock: 1,
          version: 0,
          name: baseUser.cart.items[0].product.name,
          price: baseUser.cart.items[0].product.price,
        },
      ]);
      await expect(service.checkout("user-1", baseInput)).rejects.toThrow(
        BadRequestError,
      );
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

  it("sets discountCode to undefined when discountAmount is 0", async () => {
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    const inputWithoutDiscount = { ...baseInput, discountCode: undefined };
    await service.checkout("user-1", inputWithoutDiscount);
    expect(repository.createOrder).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ discountCode: undefined }),
    );
  });

  it("uses user phone when input phone is missing", async () => {
    const userWithPhone = { ...baseUser, phone: "0987654321" };
    repository.findUserCartForCheckout = vi
      .fn()
      .mockResolvedValue(userWithPhone);
    const inputWithoutPhone = { ...baseInput, phone: "" };
    await service.checkout("user-1", inputWithoutPhone);
    expect(repository.createOrder).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ customerPhone: "0987654321" }),
    );
  });

  it("uses empty string when both input and user phone are missing", async () => {
    const userWithoutPhone = { ...baseUser, phone: null };
    repository.findUserCartForCheckout = vi
      .fn()
      .mockResolvedValue(userWithoutPhone);
    const inputWithoutPhone = { ...baseInput, phone: "" };
    await service.checkout("user-1", inputWithoutPhone);
    expect(repository.createOrder).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ customerPhone: "" }),
    );
  });

  it("includes notes when provided", async () => {
    const inputWithNotes = { ...baseInput, notes: "Please deliver after 5pm" };
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    await service.checkout("user-1", inputWithNotes);
    expect(repository.createOrder).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ notes: "Please deliver after 5pm" }),
    );
  });

  it("continues checkout when cached order id exists but order not found (idempotent returns null)", async () => {
    repository.findCachedOrderId = vi.fn().mockResolvedValue("order-1");
    repository.findOrderWithItems = vi.fn().mockResolvedValue(null);
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    const result = await service.checkout("user-1", baseInput);
    expect(result.idempotent).toBe(false);
    expect(repository.cacheOrderId).toHaveBeenCalled();
  });

  it("throws NotFoundError when a product is missing from lockedProducts (concurrent deletion)", async () => {
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    repository.lockProductsForUpdate = vi.fn().mockResolvedValue([]);
    await expect(service.checkout("user-1", baseInput)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("applies discount fixed amount capped at subtotal when rawAmount exceeds subtotal", async () => {
    const discountFixed = { ...discount, type: "FIXED", value: 1000 };
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    repository.findDiscountByCode = vi.fn().mockResolvedValue(discountFixed);
    repository.incrementDiscountUsage = vi.fn().mockResolvedValue(true);
    await service.checkout("user-1", {
      ...baseInput,
      discountCode: "BIGFIXED",
    });
    expect(repository.createOrder).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ discountAmount: 200 }),
    );
  });

  describe("getIdempotencyTTL coverage", () => {
    it("should cover fallback branch when env var is not set", () => {
      const oldTTL = process.env.IDEMPOTENCY_TTL;
      delete process.env.IDEMPOTENCY_TTL;

      const ttl = (CheckoutService as any).getIdempotencyTTL();
      expect(ttl).toBe(86400);

      if (oldTTL !== undefined) {
        process.env.IDEMPOTENCY_TTL = oldTTL;
      }
    });

    it("should cover env branch when env var is set", () => {
      const oldTTL = process.env.IDEMPOTENCY_TTL;
      process.env.IDEMPOTENCY_TTL = "12345";

      const ttl = (CheckoutService as any).getIdempotencyTTL();
      expect(ttl).toBe(12345);

      if (oldTTL !== undefined) {
        process.env.IDEMPOTENCY_TTL = oldTTL;
      } else {
        delete process.env.IDEMPOTENCY_TTL;
      }
    });
  });
});
