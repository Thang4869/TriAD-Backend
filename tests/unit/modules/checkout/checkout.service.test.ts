import { describe, it, expect, vi, beforeEach } from "vitest";
import { CheckoutService } from "@modules/checkout/checkout.service";
import { ICheckoutRepository } from "@modules/checkout/checkout.repository";
import { StockReservationService } from "@/modules/checkout/services/stock-reservation.service";
import { IdempotencyService } from "@/modules/checkout/services/idempotency.service";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@shared/utils/errors";
import { PricingService } from "@/modules/checkout/domain/pricing.service";

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

const mockOrder = {
  id: "order-1",
  orderNumber: "ORD-123",
  userId: "user-1",
  items: [
    {
      id: "oi-1",
      productId: "prod-1",
      quantity: 2,
      price: 100,
      total: 200,
      product: { id: "prod-1", name: "Glass", images: [], slug: "glass" },
    },
  ],
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
    saveNewOrder: vi
      .fn()
      .mockResolvedValue({ id: "order-1", orderNumber: "ORD-123" }),
    ...overrides,
  };
}

describe("CheckoutService", () => {
  let repository: ICheckoutRepository;
  let pricingService: PricingService;
  let service: CheckoutService;
  let mockStockService: StockReservationService;
  let mockIdempotencyService: IdempotencyService;

  beforeEach(() => {
    mockStockService = {
      reserveStock: vi.fn().mockResolvedValue(undefined),
    } as unknown as StockReservationService;

    mockIdempotencyService = {
      tryReturnIdempotentOrder: vi.fn().mockResolvedValue(null),
      cacheOrderId: vi.fn().mockResolvedValue(undefined),
    } as unknown as IdempotencyService;

    service = new CheckoutService(
      repository,
      pricingService,
      mockStockService,
      mockIdempotencyService,
    );

    vi.clearAllMocks();
    repository = createFakeRepository();
    pricingService = new PricingService(repository);
    service = new CheckoutService(
      repository,
      pricingService,
      mockStockService,
      mockIdempotencyService,
    );
  });

  function mockFindOrderSuccess() {
    repository.findOrderWithItems = vi.fn().mockResolvedValue(mockOrder);
  }

  it("should handle checkout without idempotency key", async () => {
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    mockFindOrderSuccess();
    const inputWithoutIdempotency = { ...baseInput, idempotencyKey: "" };
    await service.checkout("user-1", inputWithoutIdempotency);
    expect(repository.cacheOrderId).not.toHaveBeenCalled();
  });

  it("should return idempotent response when cached order exists and order found", async () => {
    // Mock idempotencyService để trả về order
    mockIdempotencyService.tryReturnIdempotentOrder = vi
      .fn()
      .mockResolvedValue({
        order: mockOrder,
        idempotent: true,
      });
    const result = await service.checkout("user-1", baseInput);
    expect(result.idempotent).toBe(true);
    expect(result.order).toEqual(mockOrder);
    expect(repository.findUserCartForCheckout).not.toHaveBeenCalled();
  });

  it("should apply percentage discount correctly", async () => {
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    mockFindOrderSuccess();
    const discountPercent = { ...discount, type: "PERCENTAGE", value: 20 };
    repository.findDiscountByCode = vi.fn().mockResolvedValue(discountPercent);
    repository.incrementDiscountUsage = vi.fn().mockResolvedValue(true);
    await service.checkout("user-1", { ...baseInput, discountCode: "SAVE20" });
    expect(repository.saveNewOrder).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        _discountAmount: expect.objectContaining({ amount: 40 }),
      }),
      expect.any(String),
    );
  });

  it("should handle discount code with maxUses and not exceed limit", async () => {
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    mockFindOrderSuccess();
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

  it("throws ConflictError when decrementProductStock fails due to version mismatch", async () => {
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    const conflictError = new ConflictError("Stock conflict");
    mockStockService.reserveStock = vi.fn().mockRejectedValue(conflictError);
    repository.runInTransaction = vi.fn().mockImplementation(async (fn) => {
      await fn({} as any);
    });
    await expect(service.checkout("user-1", baseInput)).rejects.toThrow(
      ConflictError,
    );
    expect(mockStockService.reserveStock).toHaveBeenCalled();
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
      mockIdempotencyService.tryReturnIdempotentOrder = vi
        .fn()
        .mockResolvedValue({
          order: mockOrder,
          idempotent: true,
        });
      const result = await service.checkout("user-1", baseInput);
      expect(result).toHaveProperty("idempotent", true);
      expect(repository.findUserCartForCheckout).not.toHaveBeenCalled();
    });

    it("applies free shipping if subtotal > threshold", async () => {
      const bigCart = {
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
      };
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(bigCart);
      mockFindOrderSuccess();
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
      expect(repository.saveNewOrder).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          _shippingFee: expect.objectContaining({ amount: 0 }),
        }),
        expect.any(String),
      );
    });

    it("applies discount code correctly", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
      mockFindOrderSuccess();
      repository.findDiscountByCode = vi.fn().mockResolvedValue(discount);
      repository.incrementDiscountUsage = vi.fn().mockResolvedValue(true);
      await service.checkout("user-1", {
        ...baseInput,
        discountCode: "SAVE10",
      });
      expect(repository.saveNewOrder).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          _discountAmount: expect.objectContaining({
            amount: expect.any(Number),
          }),
        }),
        expect.any(String),
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
      // lockProductsForUpdate trả về mảng rỗng
      repository.lockProductsForUpdate = vi.fn().mockResolvedValue([]);
      // stockService.reserveStock sẽ throw NotFoundError
      mockStockService.reserveStock = vi
        .fn()
        .mockRejectedValue(new NotFoundError("Product not found"));
      await expect(service.checkout("user-1", baseInput)).rejects.toThrow(
        NotFoundError,
      );
    });

    it("throws BadRequestError when locked stock is not enough for the requested quantity", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
      // lockProductsForUpdate trả về stock = 1, quantity yêu cầu là 2
      repository.lockProductsForUpdate = vi.fn().mockResolvedValue([
        {
          id: baseUser.cart.items[0].productId,
          stock: 1,
          version: 0,
          name: baseUser.cart.items[0].product.name,
          price: baseUser.cart.items[0].product.price,
        },
      ]);
      // stockService.reserveStock sẽ throw BadRequestError
      mockStockService.reserveStock = vi
        .fn()
        .mockRejectedValue(new BadRequestError("Not enough stock"));
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
      mockFindOrderSuccess();
      const result = await service.checkout("user-1", baseInput);
      expect(result.order.id).toBeDefined();
      expect(callCount).toBe(2);
    });

    it("caches order id after success", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
      mockFindOrderSuccess();
      mockIdempotencyService.cacheOrderId = vi
        .fn()
        .mockResolvedValue(undefined);
      await service.checkout("user-1", baseInput);
      // Chỉ kỳ vọng 2 tham số: idempotencyKey và orderId
      expect(mockIdempotencyService.cacheOrderId).toHaveBeenCalledWith(
        baseInput.idempotencyKey,
        expect.any(String),
      );
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
    mockFindOrderSuccess();
    const inputWithoutDiscount = { ...baseInput, discountCode: undefined };
    await service.checkout("user-1", inputWithoutDiscount);
    expect(repository.saveNewOrder).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        _discountAmount: expect.objectContaining({ amount: 0 }),
        _discountCode: undefined,
      }),
      expect.any(String),
    );
  });

  it("uses user phone when input phone is missing", async () => {
    const userWithPhone = { ...baseUser, phone: "0987654321" };
    repository.findUserCartForCheckout = vi
      .fn()
      .mockResolvedValue(userWithPhone);
    mockFindOrderSuccess();
    const inputWithoutPhone = { ...baseInput, phone: "" };
    await service.checkout("user-1", inputWithoutPhone);
    expect(repository.saveNewOrder).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ customerPhone: "0987654321" }),
      expect.any(String),
    );
  });

  it("uses empty string when both input and user phone are missing", async () => {
    const userWithoutPhone = { ...baseUser, phone: null };
    repository.findUserCartForCheckout = vi
      .fn()
      .mockResolvedValue(userWithoutPhone);
    mockFindOrderSuccess();
    const inputWithoutPhone = { ...baseInput, phone: "" };
    await service.checkout("user-1", inputWithoutPhone);
    expect(repository.saveNewOrder).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ customerPhone: "" }),
      expect.any(String),
    );
  });

  it("includes notes when provided", async () => {
    const inputWithNotes = { ...baseInput, notes: "Please deliver after 5pm" };
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    mockFindOrderSuccess();
    await service.checkout("user-1", inputWithNotes);
    expect(repository.saveNewOrder).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ notes: "Please deliver after 5pm" }),
      expect.any(String),
    );
  });

  it("continues checkout when cached order id exists but order not found", async () => {
    // Lần đầu idempotencyService trả null (không tìm thấy order)
    mockIdempotencyService.tryReturnIdempotentOrder = vi
      .fn()
      .mockResolvedValue(null);
    // Mock findUserCartForCheckout và các thành phần khác để checkout thành công
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    mockFindOrderSuccess();
    // Mock cacheOrderId để kiểm tra
    mockIdempotencyService.cacheOrderId = vi.fn().mockResolvedValue(undefined);
    const result = await service.checkout("user-1", baseInput);
    expect(result.idempotent).toBe(false);
    expect(mockIdempotencyService.cacheOrderId).toHaveBeenCalled();
  });

  it("applies discount fixed amount capped at subtotal when rawAmount exceeds subtotal", async () => {
    const discountFixed = { ...discount, type: "FIXED", value: 1000 };
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);
    mockFindOrderSuccess();
    repository.findDiscountByCode = vi.fn().mockResolvedValue(discountFixed);
    repository.incrementDiscountUsage = vi.fn().mockResolvedValue(true);
    await service.checkout("user-1", {
      ...baseInput,
      discountCode: "BIGFIXED",
    });
    expect(repository.saveNewOrder).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        _discountAmount: expect.objectContaining({ amount: 200 }),
      }),
      expect.any(String),
    );
  });

  // describe("getIdempotencyTTL coverage", () => {
  //   it("should cover fallback branch when env var is not set", () => {
  //     const oldTTL = process.env.IDEMPOTENCY_TTL;
  //     delete process.env.IDEMPOTENCY_TTL;
  //     const ttl = (CheckoutService as any).getIdempotencyTTL();
  //     expect(ttl).toBe(86400);
  //     if (oldTTL !== undefined) {
  //       process.env.IDEMPOTENCY_TTL = oldTTL;
  //     }
  //   });

  //   it("should cover env branch when env var is set", () => {
  //     const oldTTL = process.env.IDEMPOTENCY_TTL;
  //     process.env.IDEMPOTENCY_TTL = "12345";
  //     const ttl = (CheckoutService as any).getIdempotencyTTL();
  //     expect(ttl).toBe(12345);
  //     if (oldTTL !== undefined) {
  //       process.env.IDEMPOTENCY_TTL = oldTTL;
  //     } else {
  //       delete process.env.IDEMPOTENCY_TTL;
  //     }
  //   });
  // });
});
