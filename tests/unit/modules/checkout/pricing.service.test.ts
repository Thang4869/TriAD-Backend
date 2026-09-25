import { describe, it, expect, vi, beforeEach } from "vitest";
import { PricingService } from "@modules/checkout/domain/pricing.service";
import { ICheckoutRepository } from "@modules/checkout/checkout.repository";
import { Money } from "@shared/value-objects/money";
import { CHECKOUT_PRICING } from "@shared/constants/order.constant";
import { BadRequestError, ConflictError } from "@shared/utils/errors";
import { CheckoutTransaction } from "@modules/checkout/application/ports/checkout-transaction";

const tx = {} as CheckoutTransaction;

function createRepository(
  overrides: Partial<ICheckoutRepository> = {},
): ICheckoutRepository {
  return {
    findDiscountByCode: vi.fn().mockResolvedValue(null),
    incrementDiscountUsage: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as ICheckoutRepository;
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
    ...overrides,
  };
}

describe("PricingService - thuế và phí ship", () => {
  beforeEach(() => vi.clearAllMocks());

  it("thuế = subtotal × TAX_RATE", async () => {
    const service = new PricingService(createRepository());

    const result = await service.calculatePricing(
      new Money(1_000_000),
      undefined,
      tx,
    );

    expect(result.tax.getValue()).toBe(
      Math.round(1_000_000 * CHECKOUT_PRICING.TAX_RATE),
    );
  });

  it("miễn phí ship khi subtotal vượt ngưỡng", async () => {
    const service = new PricingService(createRepository());

    const result = await service.calculatePricing(
      new Money(CHECKOUT_PRICING.FREE_SHIPPING_THRESHOLD + 1),
      undefined,
      tx,
    );

    expect(result.shippingFee.getValue()).toBe(0);
  });

  it("đúng bằng ngưỡng thì vẫn tính phí ship (điều kiện là lớn hơn)", async () => {
    const service = new PricingService(createRepository());

    const result = await service.calculatePricing(
      new Money(CHECKOUT_PRICING.FREE_SHIPPING_THRESHOLD),
      undefined,
      tx,
    );

    expect(result.shippingFee.getValue()).toBe(CHECKOUT_PRICING.SHIPPING_FEE);
  });

  it("không có mã giảm giá thì discountAmount = 0 và discountCode undefined", async () => {
    const repository = createRepository();
    const service = new PricingService(repository);

    const result = await service.calculatePricing(
      new Money(100_000),
      undefined,
      tx,
    );

    expect(result.discountAmount.getValue()).toBe(0);
    expect(result.discountCode).toBeUndefined();
    expect(repository.findDiscountByCode).not.toHaveBeenCalled();
  });
});

describe("PricingService - mã giảm giá hợp lệ", () => {
  beforeEach(() => vi.clearAllMocks());

  it("giảm theo phần trăm", async () => {
    const repository = createRepository({
      findDiscountByCode: vi
        .fn()
        .mockResolvedValue(discount({ type: "PERCENTAGE", value: 10 })),
    });

    const result = await new PricingService(repository).calculatePricing(
      new Money(1_000_000),
      "SALE10",
      tx,
    );

    expect(result.discountAmount.getValue()).toBe(100_000);
    expect(result.discountCode).toBe("SALE10");
  });

  it("giảm số tiền cố định", async () => {
    const repository = createRepository({
      findDiscountByCode: vi
        .fn()
        .mockResolvedValue(discount({ type: "FIXED", value: 50_000 })),
    });

    const result = await new PricingService(repository).calculatePricing(
      new Money(1_000_000),
      "FIXED50",
      tx,
    );

    expect(result.discountAmount.getValue()).toBe(50_000);
  });

  it("mức giảm bị chặn trần bằng subtotal (không cho tổng âm)", async () => {
    const repository = createRepository({
      findDiscountByCode: vi
        .fn()
        .mockResolvedValue(discount({ type: "FIXED", value: 999_999 })),
    });

    const result = await new PricingService(repository).calculatePricing(
      new Money(100_000),
      "BIG",
      tx,
    );

    expect(result.discountAmount.getValue()).toBe(100_000);
  });

  it("tăng usage count của mã sau khi áp dụng thành công", async () => {
    const repository = createRepository({
      findDiscountByCode: vi.fn().mockResolvedValue(discount({ maxUses: 100 })),
    });

    await new PricingService(repository).calculatePricing(
      new Money(1_000_000),
      "SALE10",
      tx,
    );

    expect(repository.incrementDiscountUsage).toHaveBeenCalledWith(
      tx,
      "disc-1",
      100,
    );
  });

  it("mã còn hạn (expiresAt ở tương lai) vẫn dùng được", async () => {
    const repository = createRepository({
      findDiscountByCode: vi
        .fn()
        .mockResolvedValue(
          discount({ expiresAt: new Date(Date.now() + 86_400_000) }),
        ),
    });

    await expect(
      new PricingService(repository).calculatePricing(
        new Money(1_000_000),
        "SALE10",
        tx,
      ),
    ).resolves.toMatchObject({ discountCode: "SALE10" });
  });

  it("đạt đúng minOrderAmount thì hợp lệ", async () => {
    const repository = createRepository({
      findDiscountByCode: vi
        .fn()
        .mockResolvedValue(discount({ minOrderAmount: 500_000 })),
    });

    await expect(
      new PricingService(repository).calculatePricing(
        new Money(500_000),
        "SALE10",
        tx,
      ),
    ).resolves.toBeDefined();
  });
});

describe("PricingService - mã giảm giá không hợp lệ", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mã không tồn tại → BadRequest", async () => {
    const repository = createRepository();

    await expect(
      new PricingService(repository).calculatePricing(
        new Money(100_000),
        "KHONGCO",
        tx,
      ),
    ).rejects.toThrow(new BadRequestError("Invalid or inactive discount code"));
  });

  it("mã đã bị vô hiệu hoá → BadRequest", async () => {
    const repository = createRepository({
      findDiscountByCode: vi
        .fn()
        .mockResolvedValue(discount({ isActive: false })),
    });

    await expect(
      new PricingService(repository).calculatePricing(
        new Money(100_000),
        "SALE10",
        tx,
      ),
    ).rejects.toThrow(BadRequestError);
  });

  it("mã đã hết hạn → BadRequest", async () => {
    const repository = createRepository({
      findDiscountByCode: vi
        .fn()
        .mockResolvedValue(discount({ expiresAt: new Date("2020-01-01") })),
    });

    await expect(
      new PricingService(repository).calculatePricing(
        new Money(100_000),
        "SALE10",
        tx,
      ),
    ).rejects.toThrow(new BadRequestError("Discount code has expired"));
  });

  it("chưa đạt giá trị đơn tối thiểu → BadRequest kèm số tiền yêu cầu", async () => {
    const repository = createRepository({
      findDiscountByCode: vi
        .fn()
        .mockResolvedValue(discount({ minOrderAmount: 500_000 })),
    });

    await expect(
      new PricingService(repository).calculatePricing(
        new Money(100_000),
        "SALE10",
        tx,
      ),
    ).rejects.toThrow(/at least 500000/);
  });

  it("mã vừa hết lượt dùng (race condition) → ConflictError để client retry", async () => {
    const repository = createRepository({
      findDiscountByCode: vi.fn().mockResolvedValue(discount({ maxUses: 1 })),
      incrementDiscountUsage: vi.fn().mockResolvedValue(false),
    });

    await expect(
      new PricingService(repository).calculatePricing(
        new Money(1_000_000),
        "SALE10",
        tx,
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("mã không hợp lệ thì không tăng usage count", async () => {
    const repository = createRepository({
      findDiscountByCode: vi
        .fn()
        .mockResolvedValue(discount({ isActive: false })),
    });

    await new PricingService(repository)
      .calculatePricing(new Money(100_000), "SALE10", tx)
      .catch(() => undefined);

    expect(repository.incrementDiscountUsage).not.toHaveBeenCalled();
  });
});
