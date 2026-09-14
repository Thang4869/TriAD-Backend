export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace(this, new.target);
  }
}

export abstract class InvariantViolationError extends DomainError {}

export abstract class DomainNotFoundError extends DomainError {}

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

export class OrderNotMutableError extends InvariantViolationError {
  readonly code = "ORDER.NOT_MUTABLE";
  constructor(reason: "ALREADY_PLACED" | "NOT_PENDING") {
    super(
      reason === "ALREADY_PLACED"
        ? "Cannot modify an order that has already been placed"
        : "Cannot modify an order that is not PENDING",
      { reason },
    );
  }
}

export class InvalidOrderItemError extends InvariantViolationError {
  readonly code = "ORDER.INVALID_ITEM";
  constructor(message: string) {
    super(message);
  }
}

export class InvalidDiscountError extends InvariantViolationError {
  readonly code = "ORDER.INVALID_DISCOUNT";
  constructor(message: string) {
    super(message);
  }
}

export class EmptyOrderError extends InvariantViolationError {
  readonly code = "ORDER.EMPTY";
  constructor() {
    super("Cannot place an order with no items");
  }
}

export class OrderAlreadyPlacedError extends InvariantViolationError {
  readonly code = "ORDER.ALREADY_PLACED";
  constructor() {
    super("Order has already been placed");
  }
}

export class InvalidOrderTransitionError extends InvariantViolationError {
  readonly code = "ORDER.INVALID_TRANSITION";
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Cannot transition order from ${from} to ${to}`, { from, to });
  }
}

export class OrderNotCancellableError extends InvariantViolationError {
  readonly code = "ORDER.NOT_CANCELLABLE";
  constructor(reason: "DELIVERED" | "ALREADY_CANCELLED") {
    super(
      reason === "DELIVERED"
        ? "Cannot cancel a delivered order"
        : "Order already cancelled",
      { reason },
    );
  }
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export class InvalidCartQuantityError extends InvariantViolationError {
  readonly code = "CART.INVALID_QUANTITY";
  constructor(message: string) {
    super(message);
  }
}

export class CartItemNotFoundError extends DomainNotFoundError {
  readonly code = "CART.ITEM_NOT_FOUND";
  constructor(productId: string) {
    super(`Item ${productId} not found in cart`, { productId });
  }
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export class InvalidPriceError extends InvariantViolationError {
  readonly code = "PRODUCT.INVALID_PRICE";
  constructor(message: string) {
    super(message);
  }
}

export class InsufficientStockError extends InvariantViolationError {
  readonly code = "PRODUCT.INSUFFICIENT_STOCK";
  constructor(
    public readonly available: number,
    public readonly requested: number,
  ) {
    super(
      `Insufficient stock. Available: ${available}, requested: ${requested}`,
      {
        available,
        requested,
      },
    );
  }
}

export class InvalidStockQuantityError extends InvariantViolationError {
  readonly code = "PRODUCT.INVALID_STOCK_QUANTITY";
  constructor(message: string) {
    super(message);
  }
}

export class ProductAlreadyActiveError extends InvariantViolationError {
  readonly code = "PRODUCT.ALREADY_ACTIVE";
  constructor() {
    super("Product already active");
  }
}

export class ProductAlreadyInactiveError extends InvariantViolationError {
  readonly code = "PRODUCT.ALREADY_INACTIVE";
  constructor() {
    super("Product already inactive");
  }
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export class UserAlreadyVerifiedError extends InvariantViolationError {
  readonly code = "USER.ALREADY_VERIFIED";
  constructor() {
    super("User already verified");
  }
}

export class TwoFactorAlreadyEnabledError extends InvariantViolationError {
  readonly code = "USER.2FA_ALREADY_ENABLED";
  constructor() {
    super("Two-factor authentication is already enabled");
  }
}

export class TwoFactorNotSetUpError extends InvariantViolationError {
  readonly code = "USER.2FA_NOT_SET_UP";
  constructor() {
    super("Two-factor authentication has not been set up");
  }
}

export class TwoFactorNotEnabledError extends InvariantViolationError {
  readonly code = "USER.2FA_NOT_ENABLED";
  constructor() {
    super("Two-factor authentication is not enabled");
  }
}

export class InvalidUserStateError extends InvariantViolationError {
  readonly code = "USER.INVALID_STATE";
  constructor(message: string) {
    super(message);
  }
}

export class WeakPasswordError extends InvariantViolationError {
  readonly code = "USER.WEAK_PASSWORD";
  constructor(minLength: number) {
    super(`Password must be at least ${minLength} characters`, { minLength });
  }
}

export const DOMAIN_ERROR_STATUS_MAP: Record<string, number> = {
  "ORDER.NOT_MUTABLE": 409,
  "ORDER.INVALID_ITEM": 400,
  "ORDER.INVALID_DISCOUNT": 400,
  "ORDER.EMPTY": 400,
  "ORDER.ALREADY_PLACED": 409,
  "ORDER.INVALID_TRANSITION": 409,
  "ORDER.NOT_CANCELLABLE": 409,
  "CART.INVALID_QUANTITY": 400,
  "CART.ITEM_NOT_FOUND": 404,
  "PRODUCT.INVALID_PRICE": 400,
  "PRODUCT.INSUFFICIENT_STOCK": 409,
  "PRODUCT.INVALID_STOCK_QUANTITY": 400,
  "PRODUCT.ALREADY_ACTIVE": 409,
  "PRODUCT.ALREADY_INACTIVE": 409,
  "USER.ALREADY_VERIFIED": 409,
  "USER.2FA_ALREADY_ENABLED": 409,
  "USER.2FA_NOT_SET_UP": 409,
  "USER.2FA_NOT_ENABLED": 409,
  "USER.INVALID_STATE": 400,
  "USER.WEAK_PASSWORD": 400,
};
