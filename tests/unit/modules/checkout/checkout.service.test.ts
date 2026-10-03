import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CheckoutService } from "@modules/checkout/checkout.service";
import { ICheckoutRepository } from "@modules/checkout/application/ports/checkout.repository.port";
import type {
  CheckoutTransaction,
  CheckoutUnitOfWork,
} from "@modules/checkout/application/ports/checkout-transaction";
import { StockReservationService } from "@/modules/checkout/services/stock-reservation.service";
import { PricingService } from "@/modules/checkout/services/pricing.service";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@shared/utils/errors";
import { IdempotencyConflictError } from "@modules/checkout/application/errors/idempotency-conflict.error";

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
        product: {
          id: "prod-1",
          name: "Glass",
          price: 100,
          stock: 10,
        },
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
      product: {
        id: "prod-1",
        name: "Glass",
        images: [],
        slug: "glass",
      },
    },
  ],
};

function defaultLockedProduct() {
  return {
    id: baseUser.cart.items[0].productId,
    stock: baseUser.cart.items[0].product.stock,
    version: 0,
    name: baseUser.cart.items[0].product.name,
    price: baseUser.cart.items[0].product.price,
    isActive: true,
  };
}

function createTransaction(
  overrides: Partial<CheckoutTransaction> = {},
): CheckoutTransaction {
  return {
    lockProductsForUpdate: vi.fn().mockResolvedValue([defaultLockedProduct()]),

    decrementProductStock: vi.fn().mockResolvedValue(true),

    persistProductEvent: vi.fn().mockResolvedValue(undefined),

    findDiscountByCode: vi.fn().mockResolvedValue(null),

    incrementDiscountUsage: vi.fn().mockResolvedValue(true),

    clearCartItems: vi.fn().mockResolvedValue(undefined),

    saveNewOrder: vi.fn().mockResolvedValue({
      id: "order-1",
      orderNumber: "ORD-123",
    }),

    ...overrides,
  } as unknown as CheckoutTransaction;
}

function createFakeRepository(
  overrides: Partial<ICheckoutRepository> = {},
): ICheckoutRepository {
  return {
    findOrderWithItems: vi.fn().mockResolvedValue(null),
    findOrderByIdempotencyKey: vi.fn().mockResolvedValue(null),
    findUserCartForCheckout: vi.fn().mockResolvedValue(null),

    lockProductsForUpdate: vi.fn().mockResolvedValue([defaultLockedProduct()]),

    decrementProductStock: vi.fn().mockResolvedValue(true),
    persistProductEvent: vi.fn().mockResolvedValue(undefined),

    findDiscountByCode: vi.fn().mockResolvedValue(null),
    incrementDiscountUsage: vi.fn().mockResolvedValue(true),

    clearCartItems: vi.fn().mockResolvedValue(undefined),

    findOrdersByUser: vi.fn().mockResolvedValue([]),
    countOrdersByUser: vi.fn().mockResolvedValue(0),
    findOrderByUserAndId: vi.fn().mockResolvedValue(null),

    saveNewOrder: vi.fn().mockResolvedValue({
      id: "order-1",
      orderNumber: "ORD-123",
    }),

    ...overrides,
  } as ICheckoutRepository;
}

describe("CheckoutService", () => {
  let repository: ICheckoutRepository;
  let transaction: CheckoutTransaction;
  let unitOfWork: CheckoutUnitOfWork;
  let pricingService: PricingService;
  let service: CheckoutService;
  let mockStockService: StockReservationService;

  beforeEach(() => {
    vi.clearAllMocks();

    transaction = createTransaction();

    unitOfWork = {
      run: vi
        .fn()
        .mockImplementation(
          async (work: (tx: CheckoutTransaction) => Promise<unknown>) =>
            work(transaction),
        ),
    } as CheckoutUnitOfWork;

    repository = createFakeRepository();

    unitOfWork.run = vi
      .fn()
      .mockImplementation(
        async (fn: (tx: CheckoutTransaction) => Promise<unknown>) =>
          fn(transaction),
      ) as unknown as CheckoutUnitOfWork["run"];

    mockStockService = {
      reserveStock: vi.fn().mockResolvedValue([defaultLockedProduct()]),
    } as unknown as StockReservationService;

    pricingService = new PricingService({
      isEnabled: () => true,
    });

    service = new CheckoutService(
      repository,
      unitOfWork,
      pricingService,
      mockStockService,
      {
        generate: vi.fn().mockReturnValue("ORD-TEST-123"),
      },
    );
  });

  function mockFindOrderSuccess(): void {
    repository.findOrderWithItems = vi.fn().mockResolvedValue(mockOrder);
  }

  it("should handle checkout without idempotency key", async () => {
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

    mockFindOrderSuccess();

    const inputWithoutIdempotency = {
      ...baseInput,
      idempotencyKey: "",
    };

    await service.checkout("user-1", inputWithoutIdempotency);
  });

  it("should apply percentage discount correctly", async () => {
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

    mockFindOrderSuccess();

    const discountPercent = {
      ...discount,
      type: "PERCENTAGE" as const,
      value: 20,
    };

    transaction = createTransaction({
      findDiscountByCode: vi.fn().mockResolvedValue(discountPercent),

      incrementDiscountUsage: vi.fn().mockResolvedValue(true),
    });

    await service.checkout("user-1", {
      ...baseInput,
      discountCode: "SAVE20",
    });

    expect(transaction.saveNewOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        _discountAmount: expect.objectContaining({
          amount: 40,
        }),
      }),
      expect.any(String),
    );
  });

  it("should handle discount code with maxUses and not exceed limit", async () => {
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

    mockFindOrderSuccess();

    const discountLimited = {
      ...discount,
      maxUses: 2,
      usedCount: 1,
    };

    transaction = createTransaction({
      findDiscountByCode: vi.fn().mockResolvedValue(discountLimited),

      incrementDiscountUsage: vi.fn().mockResolvedValue(true),
    });

    await service.checkout("user-1", {
      ...baseInput,
      discountCode: "LIMITED",
    });

    expect(transaction.incrementDiscountUsage).toHaveBeenCalledWith(
      discountLimited.id,
      2,
    );
  });

  it("throws non-ConflictError immediately without retrying", async () => {
    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

    const nonConflictError = new BadRequestError("some other error");

    unitOfWork.run = vi.fn().mockRejectedValue(nonConflictError);

    await expect(service.checkout("user-1", baseInput)).rejects.toThrow(
      BadRequestError,
    );

    expect(unitOfWork.run).toHaveBeenCalledTimes(1);
  });

  describe("checkout", () => {
    it("returns the existing order for the same idempotency key without executing checkout again", async () => {
      repository.findOrderByIdempotencyKey = vi
        .fn()
        .mockResolvedValue(mockOrder);

      const result = await service.checkout("user-1", baseInput);

      expect(repository.findOrderByIdempotencyKey).toHaveBeenCalledWith(
        "user-1",
        "idem-1",
      );

      expect(result).toEqual({
        order: mockOrder,
        idempotent: true,
      });

      expect(repository.findUserCartForCheckout).not.toHaveBeenCalled();

      expect(unitOfWork.run).not.toHaveBeenCalled();

      expect(mockStockService.reserveStock).not.toHaveBeenCalled();

      expect(transaction.saveNewOrder).not.toHaveBeenCalled();

      expect(transaction.clearCartItems).not.toHaveBeenCalled();
    });

    it("returns the existing order when a concurrent checkout wins the idempotency race", async () => {
      repository.findOrderByIdempotencyKey = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockOrder);

      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

      unitOfWork.run = vi
        .fn()
        .mockRejectedValue(new IdempotencyConflictError());

      const result = await service.checkout("user-1", baseInput);

      expect(repository.findOrderByIdempotencyKey).toHaveBeenNthCalledWith(
        1,
        "user-1",
        "idem-1",
      );

      expect(repository.findOrderByIdempotencyKey).toHaveBeenNthCalledWith(
        2,
        "user-1",
        "idem-1",
      );

      expect(result).toEqual({
        order: mockOrder,
        idempotent: true,
      });

      expect(unitOfWork.run).toHaveBeenCalledTimes(1);

      expect(repository.findOrderWithItems).not.toHaveBeenCalled();
    });

    it("rethrows idempotency conflict when the existing order cannot be recovered", async () => {
      repository.findOrderByIdempotencyKey = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

      unitOfWork.run = vi
        .fn()
        .mockRejectedValue(new IdempotencyConflictError());

      await expect(
        service.checkout("user-1", baseInput),
      ).rejects.toBeInstanceOf(IdempotencyConflictError);

      expect(repository.findOrderByIdempotencyKey).toHaveBeenCalledTimes(2);

      expect(repository.findOrderWithItems).not.toHaveBeenCalled();
    });

    it("throws if cart is empty", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue({
        ...baseUser,
        cart: {
          ...baseUser.cart,
          items: [],
        },
      });

      await expect(service.checkout("user-1", baseInput)).rejects.toThrow(
        BadRequestError,
      );
    });

    it("throws if order was persisted but cannot be re-fetched right after (data-integrity guard)", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

      await expect(service.checkout("user-1", baseInput)).rejects.toThrow(
        "Failed to retrieve created order",
      );
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
              product: {
                ...baseUser.cart.items[0].product,
                price: 60_000,
              },
            },
          ],
        },
      };

      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(bigCart);

      mockFindOrderSuccess();

      mockStockService.reserveStock = vi.fn().mockResolvedValue([
        {
          id: baseUser.cart.items[0].productId,
          stock: 10,
          version: 0,
          name: "Glass",
          price: 60_000,
          isActive: true,
        },
      ]);

      await service.checkout("user-1", baseInput);

      expect(transaction.saveNewOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          _shippingFee: expect.objectContaining({
            amount: 0,
          }),
        }),
        expect.any(String),
      );
    });

    it("applies discount code correctly", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

      mockFindOrderSuccess();

      transaction = createTransaction({
        findDiscountByCode: vi.fn().mockResolvedValue(discount),

        incrementDiscountUsage: vi.fn().mockResolvedValue(true),
      });

      await service.checkout("user-1", {
        ...baseInput,
        discountCode: "SAVE10",
      });

      expect(transaction.saveNewOrder).toHaveBeenCalledWith(
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

      transaction = createTransaction({
        findDiscountByCode: vi.fn().mockResolvedValue({
          ...discount,
          isActive: false,
        }),
      });

      await expect(
        service.checkout("user-1", {
          ...baseInput,
          discountCode: "INACTIVE",
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("throws if discount code expired", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

      transaction = createTransaction({
        findDiscountByCode: vi.fn().mockResolvedValue({
          ...discount,
          expiresAt: new Date(Date.now() - 1000),
        }),
      });

      await expect(
        service.checkout("user-1", {
          ...baseInput,
          discountCode: "EXPIRED",
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("throws if order amount below minOrderAmount", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

      transaction = createTransaction({
        findDiscountByCode: vi.fn().mockResolvedValue({
          ...discount,
          minOrderAmount: 500,
        }),
      });

      await expect(
        service.checkout("user-1", {
          ...baseInput,
          discountCode: "MIN",
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("throws NotFoundError if a cart product is missing from the locked products", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

      mockStockService.reserveStock = vi
        .fn()
        .mockRejectedValue(new NotFoundError("Product not found"));

      await expect(service.checkout("user-1", baseInput)).rejects.toThrow(
        NotFoundError,
      );
    });

    it("throws BadRequestError when locked stock is not enough for the requested quantity", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

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

      unitOfWork.run = vi
        .fn()
        .mockImplementation(
          async (fn: (tx: CheckoutTransaction) => Promise<unknown>) => {
            callCount++;

            if (callCount === 1) {
              throw new ConflictError("stock conflict");
            }

            return fn(transaction);
          },
        ) as unknown as CheckoutUnitOfWork["run"];

      mockFindOrderSuccess();

      const result = await service.checkout("user-1", baseInput);

      expect(result.order.id).toBeDefined();
      expect(callCount).toBe(2);
    });

    it("uses the locked product price instead of the stale cart price", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue({
        ...baseUser,
        cart: {
          ...baseUser.cart,
          items: [
            {
              ...baseUser.cart.items[0],
              product: {
                ...baseUser.cart.items[0].product,
                price: 100,
              },
            },
          ],
        },
      });

      mockStockService.reserveStock = vi.fn().mockResolvedValue([
        {
          id: "prod-1",
          name: "Glass",
          stock: 10,
          version: 2,
          price: 150,
          isActive: true,
        },
      ]);

      mockFindOrderSuccess();

      await service.checkout("user-1", baseInput);

      expect(transaction.saveNewOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          _items: [
            expect.objectContaining({
              productId: "prod-1",
              quantity: 2,
              unitPrice: expect.objectContaining({
                amount: 150,
              }),
            }),
          ],
        }),
        "idem-1",
      );
    });

    it("uses the injected order number generator", async () => {
      const orderNumberGenerator = {
        generate: vi.fn().mockReturnValue("ORD-COLLISION-SAFE-123"),
      };

      service = new CheckoutService(
        repository,
        unitOfWork,
        pricingService,
        mockStockService,
        orderNumberGenerator,
      );

      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

      mockFindOrderSuccess();

      await service.checkout("user-1", baseInput);

      expect(orderNumberGenerator.generate).toHaveBeenCalledTimes(1);

      expect(transaction.saveNewOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          _orderNumber: expect.objectContaining({
            value: "ORD-COLLISION-SAFE-123",
          }),
        }),
        "idem-1",
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
      const order = {
        id: "order-1",
      };

      repository.findOrderByUserAndId = vi.fn().mockResolvedValue(order);

      const result = await service.getOrder("order-1", "user-1");

      expect(result).toBe(order);
    });
  });

  describe("getOrders", () => {
    it("returns paginated orders", async () => {
      repository.findOrdersByUser = vi.fn().mockResolvedValue([
        {
          id: "o1",
        },
      ]);

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

    const inputWithoutDiscount = {
      ...baseInput,
      discountCode: undefined,
    };

    await service.checkout("user-1", inputWithoutDiscount);

    expect(transaction.saveNewOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        _discountAmount: expect.objectContaining({
          amount: 0,
        }),
        _discountCode: undefined,
      }),
      expect.any(String),
    );
  });

  it("uses user phone when input phone is missing", async () => {
    const userWithPhone = {
      ...baseUser,
      phone: "0987654321",
    };

    repository.findUserCartForCheckout = vi
      .fn()
      .mockResolvedValue(userWithPhone);

    mockFindOrderSuccess();

    const inputWithoutPhone = {
      ...baseInput,
      phone: "",
    };

    await service.checkout("user-1", inputWithoutPhone);

    expect(transaction.saveNewOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        customerPhone: "0987654321",
      }),
      expect.any(String),
    );
  });

  it("uses empty string when both input and user phone are missing", async () => {
    const userWithoutPhone = {
      ...baseUser,
      phone: null,
    };

    repository.findUserCartForCheckout = vi
      .fn()
      .mockResolvedValue(userWithoutPhone);

    mockFindOrderSuccess();

    const inputWithoutPhone = {
      ...baseInput,
      phone: "",
    };

    await service.checkout("user-1", inputWithoutPhone);

    expect(transaction.saveNewOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        customerPhone: "",
      }),
      expect.any(String),
    );
  });

  it("includes notes when provided", async () => {
    const inputWithNotes = {
      ...baseInput,
      notes: "Please deliver after 5pm",
    };

    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

    mockFindOrderSuccess();

    await service.checkout("user-1", inputWithNotes);

    expect(transaction.saveNewOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: "Please deliver after 5pm",
      }),
      expect.any(String),
    );
  });

  it("applies discount fixed amount capped at subtotal when rawAmount exceeds subtotal", async () => {
    const discountFixed = {
      ...discount,
      type: "FIXED" as const,
      value: 1000,
    };

    repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

    mockFindOrderSuccess();

    transaction = createTransaction({
      findDiscountByCode: vi.fn().mockResolvedValue(discountFixed),

      incrementDiscountUsage: vi.fn().mockResolvedValue(true),
    });

    await service.checkout("user-1", {
      ...baseInput,
      discountCode: "BIGFIXED",
    });

    expect(transaction.saveNewOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        _discountAmount: expect.objectContaining({
          amount: 200,
        }),
      }),
      expect.any(String),
    );
  });

  describe("retry behavior (fake timers)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("throws ConflictError when decrementProductStock fails due to version mismatch", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

      const conflictError = new ConflictError("Stock conflict");

      mockStockService.reserveStock = vi.fn().mockRejectedValue(conflictError);

      unitOfWork.run = vi
        .fn()
        .mockImplementation(
          async (fn: (tx: CheckoutTransaction) => Promise<unknown>) =>
            fn(transaction),
        ) as unknown as CheckoutUnitOfWork["run"];

      const promise = service.checkout("user-1", baseInput);

      const assertion = expect(promise).rejects.toThrow(ConflictError);

      await vi.runAllTimersAsync();
      await assertion;

      expect(mockStockService.reserveStock).toHaveBeenCalled();
    });

    it("throws ConflictError after exhausting all retries", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

      let callCount = 0;

      unitOfWork.run = vi.fn().mockImplementation(async () => {
        callCount++;

        throw new ConflictError("stock conflict");
      });

      const promise = service.checkout("user-1", baseInput);

      const assertion = expect(promise).rejects.toThrow(ConflictError);

      await vi.runAllTimersAsync();
      await assertion;

      expect(callCount).toBe(6);
    });

    it("throws ConflictError if discount usage limit reached", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

      transaction = createTransaction({
        findDiscountByCode: vi.fn().mockResolvedValue({
          ...discount,
          maxUses: 1,
          usedCount: 1,
        }),

        incrementDiscountUsage: vi.fn().mockResolvedValue(false),
      });

      const promise = service.checkout("user-1", {
        ...baseInput,
        discountCode: "USED",
      });

      const assertion = expect(promise).rejects.toThrow(ConflictError);

      await vi.runAllTimersAsync();
      await assertion;

      expect(transaction.incrementDiscountUsage).toHaveBeenCalled();
    });

    it("retries transaction conflict with exponential backoff and jitter", async () => {
      repository.findUserCartForCheckout = vi.fn().mockResolvedValue(baseUser);

      mockFindOrderSuccess();

      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);

      unitOfWork.run = vi
        .fn()
        .mockRejectedValueOnce(new ConflictError("Transaction conflict"))
        .mockImplementationOnce(
          async (fn: (tx: CheckoutTransaction) => Promise<unknown>) =>
            fn(transaction),
        ) as unknown as CheckoutUnitOfWork["run"];

      const promise = service.checkout("user-1", baseInput);

      await vi.advanceTimersByTimeAsync(149);

      expect(unitOfWork.run).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);

      await promise;

      expect(unitOfWork.run).toHaveBeenCalledTimes(2);

      expect(randomSpy).toHaveBeenCalledTimes(1);

      randomSpy.mockRestore();
    });
  });
});
