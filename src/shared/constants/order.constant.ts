export const PaymentMethod = {
  COD: "COD",
  CARD: "CARD",
  BANKING: "BANKING",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const DiscountType = {
  PERCENTAGE: "PERCENTAGE",
  FIXED: "FIXED",
} as const;
export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];

export const CHECKOUT_PRICING = {
  FREE_SHIPPING_THRESHOLD: 500_000,
  SHIPPING_FEE: 30_000,
  TAX_RATE: 0.1,
} as const;
