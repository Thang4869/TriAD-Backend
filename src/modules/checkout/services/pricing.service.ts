import { Money } from "@shared/value-objects/money";
import { CHECKOUT_PRICING } from "@shared/constants/order.constant";
import { CheckoutTransaction } from "../application/ports/checkout-transaction";
import {
  ValidationError,
  ConflictError,
} from "@shared/errors/application-error";
import {
  FeatureFlag,
  FeatureFlagPort,
} from "@shared/application/feature-flags/feature-flag.port";

export interface PricingResult {
  tax: Money;
  shippingFee: Money;
  discountAmount: Money;
  discountCode?: string;
}

export class PricingService {
  constructor(private readonly featureFlags: FeatureFlagPort) {}

  async calculatePricing(
    subtotal: Money,
    discountCode: string | undefined,
    tx: CheckoutTransaction,
  ): Promise<PricingResult> {
    return this.price(subtotal, discountCode, tx, true);
  }

  async previewPricing(
    subtotal: Money,
    discountCode: string | undefined,
    tx: CheckoutTransaction,
  ): Promise<PricingResult> {
    return this.price(subtotal, discountCode, tx, false);
  }

  private async price(
    subtotal: Money,
    discountCode: string | undefined,
    tx: CheckoutTransaction,
    consumeDiscountUsage: boolean,
  ): Promise<PricingResult> {
    const tax = subtotal.multiply(CHECKOUT_PRICING.TAX_RATE);

    const shippingFee = new Money(
      subtotal.getValue() >= CHECKOUT_PRICING.FREE_SHIPPING_THRESHOLD
        ? 0
        : CHECKOUT_PRICING.SHIPPING_FEE,
    );

    let discountAmount = new Money(0);
    let appliedDiscountCode: string | undefined;

    if (
      discountCode &&
      this.featureFlags.isEnabled(FeatureFlag.DiscountSystem)
    ) {
      const discount = await tx.findDiscountByCode(discountCode);

      if (!discount || !discount.isActive) {
        throw new ValidationError("Invalid or inactive discount code");
      }

      if (discount.expiresAt && discount.expiresAt < new Date()) {
        throw new ValidationError("Discount code has expired");
      }

      if (
        discount.minOrderAmount != null &&
        subtotal.getValue() < discount.minOrderAmount
      ) {
        throw new ValidationError(
          `Order must be at least ${discount.minOrderAmount} to use this discount code`,
        );
      }

      if (consumeDiscountUsage) {
        const success = await tx.incrementDiscountUsage(
          discount.id,
          discount.maxUses,
        );
        if (!success) {
          throw new ConflictError(
            "Discount code just reached its usage limit. Please retry.",
          );
        }
      } else if (
        discount.maxUses !== null &&
        discount.usedCount >= discount.maxUses
      ) {
        throw new ValidationError("Discount code has reached its usage limit");
      }

      const rawAmount =
        discount.type === "PERCENTAGE"
          ? subtotal.multiply(discount.value / 100)
          : new Money(discount.value);

      discountAmount = subtotal.lessThan(rawAmount) ? subtotal : rawAmount;

      appliedDiscountCode = discountCode;
    }

    return {
      tax,
      shippingFee,
      discountAmount,
      discountCode: appliedDiscountCode,
    };
  }
}
