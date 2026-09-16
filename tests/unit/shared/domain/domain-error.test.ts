import { describe, it, expect } from "vitest";
import {
  DomainError,
  InvariantViolationError,
  DomainNotFoundError,
  OrderNotMutableError,
  InvalidOrderItemError,
  InvalidDiscountError,
  EmptyOrderError,
  OrderAlreadyPlacedError,
  InvalidOrderTransitionError,
  OrderNotCancellableError,
  InvalidCartQuantityError,
  CartItemNotFoundError,
  InvalidPriceError,
  InsufficientStockError,
  InvalidStockQuantityError,
  ProductAlreadyActiveError,
  ProductAlreadyInactiveError,
  UserAlreadyVerifiedError,
  TwoFactorAlreadyEnabledError,
  TwoFactorNotSetUpError,
  TwoFactorNotEnabledError,
  InvalidUserStateError,
  WeakPasswordError,
  DOMAIN_ERROR_STATUS_MAP,
} from "@shared/domain/errors/domain-error";

/**
 * Every concrete DomainError must be constructed at least once, otherwise its
 * constructor body (and the `code` field initialiser) stays uncovered.
 */
const cases: Array<{
  name: string;
  build: () => DomainError;
  code: string;
  base: typeof InvariantViolationError | typeof DomainNotFoundError;
  message?: RegExp;
  context?: Record<string, unknown>;
}> = [
  {
    name: "OrderNotMutableError(ALREADY_PLACED)",
    build: () => new OrderNotMutableError("ALREADY_PLACED"),
    code: "ORDER.NOT_MUTABLE",
    base: InvariantViolationError,
    message: /already been placed/,
    context: { reason: "ALREADY_PLACED" },
  },
  {
    name: "OrderNotMutableError(NOT_PENDING)",
    build: () => new OrderNotMutableError("NOT_PENDING"),
    code: "ORDER.NOT_MUTABLE",
    base: InvariantViolationError,
    message: /not PENDING/,
    context: { reason: "NOT_PENDING" },
  },
  {
    name: "InvalidOrderItemError",
    build: () => new InvalidOrderItemError("Quantity must be positive"),
    code: "ORDER.INVALID_ITEM",
    base: InvariantViolationError,
    message: /Quantity must be positive/,
  },
  {
    name: "InvalidDiscountError",
    build: () => new InvalidDiscountError("Discount too large"),
    code: "ORDER.INVALID_DISCOUNT",
    base: InvariantViolationError,
  },
  {
    name: "EmptyOrderError",
    build: () => new EmptyOrderError(),
    code: "ORDER.EMPTY",
    base: InvariantViolationError,
    message: /no items/,
  },
  {
    name: "OrderAlreadyPlacedError",
    build: () => new OrderAlreadyPlacedError(),
    code: "ORDER.ALREADY_PLACED",
    base: InvariantViolationError,
  },
  {
    name: "InvalidOrderTransitionError",
    build: () => new InvalidOrderTransitionError("DELIVERED", "PENDING"),
    code: "ORDER.INVALID_TRANSITION",
    base: InvariantViolationError,
    message: /DELIVERED to PENDING/,
    context: { from: "DELIVERED", to: "PENDING" },
  },
  {
    name: "OrderNotCancellableError(DELIVERED)",
    build: () => new OrderNotCancellableError("DELIVERED"),
    code: "ORDER.NOT_CANCELLABLE",
    base: InvariantViolationError,
    message: /delivered order/,
    context: { reason: "DELIVERED" },
  },
  {
    name: "OrderNotCancellableError(ALREADY_CANCELLED)",
    build: () => new OrderNotCancellableError("ALREADY_CANCELLED"),
    code: "ORDER.NOT_CANCELLABLE",
    base: InvariantViolationError,
    message: /already cancelled/,
    context: { reason: "ALREADY_CANCELLED" },
  },
  {
    name: "InvalidCartQuantityError",
    build: () => new InvalidCartQuantityError("Quantity must be >= 1"),
    code: "CART.INVALID_QUANTITY",
    base: InvariantViolationError,
  },
  {
    name: "CartItemNotFoundError",
    build: () => new CartItemNotFoundError("prod-1"),
    code: "CART.ITEM_NOT_FOUND",
    base: DomainNotFoundError,
    message: /prod-1/,
    context: { productId: "prod-1" },
  },
  {
    name: "InvalidPriceError",
    build: () => new InvalidPriceError("Price cannot be negative"),
    code: "PRODUCT.INVALID_PRICE",
    base: InvariantViolationError,
  },
  {
    name: "InsufficientStockError",
    build: () => new InsufficientStockError(2, 5),
    code: "PRODUCT.INSUFFICIENT_STOCK",
    base: InvariantViolationError,
    message: /Available: 2, requested: 5/,
    context: { available: 2, requested: 5 },
  },
  {
    name: "InvalidStockQuantityError",
    build: () => new InvalidStockQuantityError("Quantity must be positive"),
    code: "PRODUCT.INVALID_STOCK_QUANTITY",
    base: InvariantViolationError,
  },
  {
    name: "ProductAlreadyActiveError",
    build: () => new ProductAlreadyActiveError(),
    code: "PRODUCT.ALREADY_ACTIVE",
    base: InvariantViolationError,
  },
  {
    name: "ProductAlreadyInactiveError",
    build: () => new ProductAlreadyInactiveError(),
    code: "PRODUCT.ALREADY_INACTIVE",
    base: InvariantViolationError,
  },
  {
    name: "UserAlreadyVerifiedError",
    build: () => new UserAlreadyVerifiedError(),
    code: "USER.ALREADY_VERIFIED",
    base: InvariantViolationError,
  },
  {
    name: "TwoFactorAlreadyEnabledError",
    build: () => new TwoFactorAlreadyEnabledError(),
    code: "USER.2FA_ALREADY_ENABLED",
    base: InvariantViolationError,
  },
  {
    name: "TwoFactorNotSetUpError",
    build: () => new TwoFactorNotSetUpError(),
    code: "USER.2FA_NOT_SET_UP",
    base: InvariantViolationError,
  },
  {
    name: "TwoFactorNotEnabledError",
    build: () => new TwoFactorNotEnabledError(),
    code: "USER.2FA_NOT_ENABLED",
    base: InvariantViolationError,
  },
  {
    name: "InvalidUserStateError",
    build: () => new InvalidUserStateError("Account locked"),
    code: "USER.INVALID_STATE",
    base: InvariantViolationError,
  },
  {
    name: "WeakPasswordError",
    build: () => new WeakPasswordError(6),
    code: "USER.WEAK_PASSWORD",
    base: InvariantViolationError,
    message: /at least 6 characters/,
    context: { minLength: 6 },
  },
];

describe("domain errors", () => {
  it.each(cases)("$name behaves like a DomainError", (c) => {
    const err = c.build();

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(c.base);
    expect(err.code).toBe(c.code);
    expect(err.name).toBe(err.constructor.name);
    expect(err.stack).toBeDefined();
    if (c.message) expect(err.message).toMatch(c.message);
    if (c.context) expect(err.context).toEqual(c.context);
  });

  it("leaves context undefined when none is provided", () => {
    expect(new EmptyOrderError().context).toBeUndefined();
  });

  it("maps every error code to an HTTP status", () => {
    const codes = [...new Set(cases.map((c) => c.code))];
    for (const code of codes) {
      expect(DOMAIN_ERROR_STATUS_MAP[code]).toBeTypeOf("number");
    }
  });

  it("has no orphan entries in the status map", () => {
    const codes = new Set(cases.map((c) => c.code));
    for (const code of Object.keys(DOMAIN_ERROR_STATUS_MAP)) {
      expect(codes.has(code)).toBe(true);
    }
  });

  it("uses 409 for conflicts and 400 for bad input", () => {
    expect(DOMAIN_ERROR_STATUS_MAP["PRODUCT.INSUFFICIENT_STOCK"]).toBe(409);
    expect(DOMAIN_ERROR_STATUS_MAP["USER.WEAK_PASSWORD"]).toBe(400);
    expect(DOMAIN_ERROR_STATUS_MAP["CART.ITEM_NOT_FOUND"]).toBe(404);
  });
});
