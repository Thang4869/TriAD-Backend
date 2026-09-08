import { Money } from "@shared/value-objects/money";
import { CHECKOUT_PRICING } from "@shared/constants/order.constant";
import { ICheckoutRepository, TxClient } from "../checkout.repository";
import { BadRequestError, ConflictError } from "@shared/utils/errors";

export interface PricingResult {
  tax: Money;
  shippingFee: Money;
  discountAmount: Money;
  discountCode?: string;
}

export class PricingService {
  constructor(private readonly repository: ICheckoutRepository) {}

  async calculatePricing(
    subtotal: Money,
    discountCode: string | undefined,
    tx: TxClient,
  ): Promise<PricingResult> {
    const tax = subtotal.multiply(CHECKOUT_PRICING.TAX_RATE);

    const shippingFee = new Money(
      subtotal.getValue() > CHECKOUT_PRICING.FREE_SHIPPING_THRESHOLD
        ? 0
        : CHECKOUT_PRICING.SHIPPING_FEE,
    );

    let discountAmount = new Money(0);
    let appliedDiscountCode: string | undefined = undefined;

    if (discountCode) {
      const discount = await this.repository.findDiscountByCode(
        tx,
        discountCode,
      );

      if (!discount || !discount.isActive) {
        throw new BadRequestError("Invalid or inactive discount code");
      }
      if (discount.expiresAt && discount.expiresAt < new Date()) {
        throw new BadRequestError("Discount code has expired");
      }
      if (
        discount.minOrderAmount != null &&
        subtotal.getValue() < discount.minOrderAmount
      ) {
        throw new BadRequestError(
          `Order must be at least ${discount.minOrderAmount} to use this discount code`,
        );
      }

      const success = await this.repository.incrementDiscountUsage(
        tx,
        discount.id,
        discount.maxUses,
      );
      if (!success) {
        throw new ConflictError(
          "Discount code just reached its usage limit. Please retry.",
        );
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
