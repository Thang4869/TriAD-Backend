import { beforeEach, describe, expect, it, vi } from "vitest";

import { PricingService } from "@modules/checkout/services/pricing.service";
import { CheckoutTransaction } from "@modules/checkout/application/ports/checkout-transaction";
import { Money } from "@shared/value-objects/money";
import { CHECKOUT_PRICING } from "@shared/constants/order.constant";
import {
  ValidationError,
  ConflictError,
} from "@shared/errors/application-error";

const enabledFeatureFlags = {
  isEnabled: vi.fn().mockReturnValue(true),
};

function createTransaction(
  overrides: Partial<CheckoutTransaction> = {},
): CheckoutTransaction {
  return {
    findDiscountByCode: vi.fn().mockResolvedValue(null),
    incrementDiscountUsage: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as CheckoutTransaction;
}

function discount(overrides: Record<string, unknown> = {}) {
  return {
    id: "disc-1",
    code: "SALE10",
    type: "PERCENTAGE",
    value: 10,
    isActive: true,
    expiresAt: null,
    minOrderAmount: null,
    maxUses: null,
    usedCount: 0,
    ...overrides,
  };
}

describe("PricingService - thuế và phí ship", () => {
  let tx: CheckoutTransaction;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = createTransaction();
  });

  it("thuế = subtotal × TAX_RATE", async () => {
    const service = new PricingService(enabledFeatureFlags);

    const result = await service.calculatePricing(
      new Money(1_000_000),
      undefined,
      tx,
    );

    expect(result.tax.getValue()).toBe(
      Math.round(1_000_000 * CHECKOUT_PRICING.TAX_RATE),
    );
  });

  it("tính phí ship ngay dưới ngưỡng", async () => {
    const service = new PricingService(enabledFeatureFlags);

    const result = await service.calculatePricing(
      new Money(CHECKOUT_PRICING.FREE_SHIPPING_THRESHOLD - 1),
      undefined,
      tx,
    );

    expect(result.shippingFee.getValue()).toBe(CHECKOUT_PRICING.SHIPPING_FEE);
  });

  it("miễn phí ship đúng bằng ngưỡng", async () => {
    const service = new PricingService(enabledFeatureFlags);

    const result = await service.calculatePricing(
      new Money(CHECKOUT_PRICING.FREE_SHIPPING_THRESHOLD),
      undefined,
      tx,
    );

    expect(result.shippingFee.getValue()).toBe(0);
  });

  it("miễn phí ship trên ngưỡng", async () => {
    const service = new PricingService(enabledFeatureFlags);

    const result = await service.calculatePricing(
      new Money(CHECKOUT_PRICING.FREE_SHIPPING_THRESHOLD + 1),
      undefined,
      tx,
    );

    expect(result.shippingFee.getValue()).toBe(0);
  });

  it("không có mã giảm giá thì discountAmount = 0 và discountCode undefined", async () => {
    const service = new PricingService(enabledFeatureFlags);

    const result = await service.calculatePricing(
      new Money(100_000),
      undefined,
      tx,
    );

    expect(result.discountAmount.getValue()).toBe(0);
    expect(result.discountCode).toBeUndefined();
    expect(tx.findDiscountByCode).not.toHaveBeenCalled();
    expect(tx.incrementDiscountUsage).not.toHaveBeenCalled();
  });
});

describe("PricingService - mã giảm giá hợp lệ", () => {
  let tx: CheckoutTransaction;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = createTransaction();
  });

  it("giảm theo phần trăm", async () => {
    tx = createTransaction({
      findDiscountByCode: vi.fn().mockResolvedValue(
        discount({
          type: "PERCENTAGE",
          value: 10,
        }),
      ),
    });

    const service = new PricingService(enabledFeatureFlags);

    const result = await service.calculatePricing(
      new Money(1_000_000),
      "SALE10",
      tx,
    );

    expect(result.discountAmount.getValue()).toBe(100_000);
    expect(result.discountCode).toBe("SALE10");
  });

  it("giảm số tiền cố định", async () => {
    tx = createTransaction({
      findDiscountByCode: vi.fn().mockResolvedValue(
        discount({
          type: "FIXED",
          value: 50_000,
        }),
      ),
    });

    const service = new PricingService(enabledFeatureFlags);

    const result = await service.calculatePricing(
      new Money(1_000_000),
      "FIXED50",
      tx,
    );

    expect(result.discountAmount.getValue()).toBe(50_000);
  });

  it("mức giảm bị chặn trần bằng subtotal (không cho tổng âm)", async () => {
    tx = createTransaction({
      findDiscountByCode: vi.fn().mockResolvedValue(
        discount({
          type: "FIXED",
          value: 999_999,
        }),
      ),
    });

    const service = new PricingService(enabledFeatureFlags);

    const result = await service.calculatePricing(
      new Money(100_000),
      "BIG",
      tx,
    );

    expect(result.discountAmount.getValue()).toBe(100_000);
  });

  it("tăng usage count của mã sau khi áp dụng thành công", async () => {
    tx = createTransaction({
      findDiscountByCode: vi.fn().mockResolvedValue(
        discount({
          maxUses: 100,
        }),
      ),
    });

    const service = new PricingService(enabledFeatureFlags);

    await service.calculatePricing(new Money(1_000_000), "SALE10", tx);

    expect(tx.incrementDiscountUsage).toHaveBeenCalledWith("disc-1", 100);
  });

  it("mã còn hạn (expiresAt ở tương lai) vẫn dùng được", async () => {
    tx = createTransaction({
      findDiscountByCode: vi.fn().mockResolvedValue(
        discount({
          expiresAt: new Date(Date.now() + 86_400_000),
        }),
      ),
    });

    const service = new PricingService(enabledFeatureFlags);

    await expect(
      service.calculatePricing(new Money(1_000_000), "SALE10", tx),
    ).resolves.toMatchObject({
      discountCode: "SALE10",
    });
  });

  it("đạt đúng minOrderAmount thì hợp lệ", async () => {
    tx = createTransaction({
      findDiscountByCode: vi.fn().mockResolvedValue(
        discount({
          minOrderAmount: 500_000,
        }),
      ),
    });

    const service = new PricingService(enabledFeatureFlags);

    await expect(
      service.calculatePricing(new Money(500_000), "SALE10", tx),
    ).resolves.toBeDefined();
  });
});

describe("PricingService - mã giảm giá không hợp lệ", () => {
  let tx: CheckoutTransaction;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = createTransaction();
  });

  it("mã không tồn tại → BadRequest", async () => {
    const service = new PricingService(enabledFeatureFlags);

    await expect(
      service.calculatePricing(new Money(100_000), "KHONGCO", tx),
    ).rejects.toThrow(new ValidationError("Invalid or inactive discount code"));
  });

  it("mã đã bị vô hiệu hoá → BadRequest", async () => {
    tx = createTransaction({
      findDiscountByCode: vi.fn().mockResolvedValue(
        discount({
          isActive: false,
        }),
      ),
    });

    const service = new PricingService(enabledFeatureFlags);

    await expect(
      service.calculatePricing(new Money(100_000), "SALE10", tx),
    ).rejects.toThrow(ValidationError);
  });

  it("mã đã hết hạn → BadRequest", async () => {
    tx = createTransaction({
      findDiscountByCode: vi.fn().mockResolvedValue(
        discount({
          expiresAt: new Date("2020-01-01"),
        }),
      ),
    });

    const service = new PricingService(enabledFeatureFlags);

    await expect(
      service.calculatePricing(new Money(100_000), "SALE10", tx),
    ).rejects.toThrow(new ValidationError("Discount code has expired"));
  });

  it("chưa đạt giá trị đơn tối thiểu → BadRequest kèm số tiền yêu cầu", async () => {
    tx = createTransaction({
      findDiscountByCode: vi.fn().mockResolvedValue(
        discount({
          minOrderAmount: 500_000,
        }),
      ),
    });

    const service = new PricingService(enabledFeatureFlags);

    await expect(
      service.calculatePricing(new Money(100_000), "SALE10", tx),
    ).rejects.toThrow(/at least 500000/);
  });

  it("mã vừa hết lượt dùng (race condition) → ConflictError để client retry", async () => {
    tx = createTransaction({
      findDiscountByCode: vi.fn().mockResolvedValue(
        discount({
          maxUses: 1,
        }),
      ),
      incrementDiscountUsage: vi.fn().mockResolvedValue(false),
    });

    const service = new PricingService(enabledFeatureFlags);

    await expect(
      service.calculatePricing(new Money(1_000_000), "SALE10", tx),
    ).rejects.toThrow(ConflictError);
  });

  it("mã không hợp lệ thì không tăng usage count", async () => {
    tx = createTransaction({
      findDiscountByCode: vi.fn().mockResolvedValue(
        discount({
          isActive: false,
        }),
      ),
    });

    const service = new PricingService(enabledFeatureFlags);

    await service
      .calculatePricing(new Money(100_000), "SALE10", tx)
      .catch(() => undefined);

    expect(tx.incrementDiscountUsage).not.toHaveBeenCalled();
  });
});

describe("PricingService - feature flags", () => {
  let tx: CheckoutTransaction;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = createTransaction();
  });

  it("does not apply discount when DiscountSystem is disabled", async () => {
    tx = createTransaction({
      findDiscountByCode: vi.fn().mockResolvedValue(discount()),
    });

    const disabledFeatureFlags = {
      isEnabled: vi.fn().mockReturnValue(false),
    };

    const service = new PricingService(disabledFeatureFlags);

    const result = await service.calculatePricing(
      new Money(1_000_000),
      "SALE10",
      tx,
    );

    expect(result.discountAmount.getValue()).toBe(0);
    expect(result.discountCode).toBeUndefined();

    expect(tx.findDiscountByCode).not.toHaveBeenCalled();
    expect(tx.incrementDiscountUsage).not.toHaveBeenCalled();
    expect(disabledFeatureFlags.isEnabled).toHaveBeenCalled();
  });
});
