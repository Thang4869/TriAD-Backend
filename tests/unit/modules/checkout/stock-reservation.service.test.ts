import { beforeEach, describe, expect, it, vi } from "vitest";

import { StockReservationService } from "@modules/checkout/services/stock-reservation.service";
import { CheckoutTransaction } from "@modules/checkout/application/ports/checkout-transaction";
import {
  ValidationError,
  ResourceNotFoundError,
  ConflictError,
} from "@shared/errors/application-error";

// withSpan chỉ là lớp bọc tracing — thay bằng passthrough để test tập trung vào logic.
vi.mock("@core/tracing/span", () => ({
  withSpan: vi.fn(
    (
      _name: string,
      fn: (setAttributes: (attributes: unknown) => void) => Promise<unknown>,
    ) => fn(() => undefined),
  ),
}));

function lockedProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod-1",
    name: "Áo thun",
    stock: 10,
    version: 1,
    price: 100_000,
    isActive: true,
    ...overrides,
  };
}

function createTransaction(
  overrides: Partial<CheckoutTransaction> = {},
): CheckoutTransaction {
  return {
    lockProductsForUpdate: vi.fn().mockResolvedValue([lockedProduct()]),

    decrementProductStock: vi.fn().mockResolvedValue(true),

    persistProductEvent: vi.fn().mockResolvedValue(undefined),

    ...overrides,
  } as unknown as CheckoutTransaction;
}

describe("StockReservationService.reserveStock", () => {
  let tx: CheckoutTransaction;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = createTransaction();
  });

  it("giỏ hàng rỗng bị chặn ngay, không khoá sản phẩm nào", async () => {
    const service = new StockReservationService();

    await expect(service.reserveStock(tx, [])).rejects.toThrow(
      new ValidationError("Cart is empty"),
    );

    expect(tx.lockProductsForUpdate).not.toHaveBeenCalled();
  });

  it("khoá đúng danh sách productId trước khi trừ kho", async () => {
    tx = createTransaction({
      lockProductsForUpdate: vi.fn().mockResolvedValue([
        lockedProduct(),
        lockedProduct({
          id: "prod-2",
          name: "Quần",
        }),
      ]),
    });

    const service = new StockReservationService();

    await service.reserveStock(tx, [
      {
        productId: "prod-1",
        quantity: 1,
      },
      {
        productId: "prod-2",
        quantity: 2,
      },
    ]);

    expect(tx.lockProductsForUpdate).toHaveBeenCalledWith(["prod-1", "prod-2"]);
  });

  it("trừ kho với version hiện tại để optimistic locking hoạt động", async () => {
    tx = createTransaction({
      lockProductsForUpdate: vi.fn().mockResolvedValue([
        lockedProduct({
          version: 7,
        }),
      ]),
    });

    const service = new StockReservationService();

    await service.reserveStock(tx, [
      {
        productId: "prod-1",
        quantity: 3,
      },
    ]);

    expect(tx.decrementProductStock).toHaveBeenCalledWith("prod-1", 7, 3);

    expect(tx.persistProductEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "ProductUpdated",
        aggregateId: "prod-1",
      }),
      8,
    );
  });

  it("sản phẩm không tồn tại → ResourceNotFoundError, không trừ kho sản phẩm nào", async () => {
    tx = createTransaction({
      lockProductsForUpdate: vi.fn().mockResolvedValue([]),
    });

    const service = new StockReservationService();

    await expect(
      service.reserveStock(tx, [
        {
          productId: "prod-1",
          quantity: 1,
        },
      ]),
    ).rejects.toThrow(ResourceNotFoundError);

    expect(tx.decrementProductStock).not.toHaveBeenCalled();
  });

  it("thiếu hàng → BadRequest kèm tên sản phẩm và số lượng còn lại", async () => {
    tx = createTransaction({
      lockProductsForUpdate: vi.fn().mockResolvedValue([
        lockedProduct({
          stock: 2,
        }),
      ]),
    });

    const service = new StockReservationService();

    await expect(
      service.reserveStock(tx, [
        {
          productId: "prod-1",
          quantity: 5,
        },
      ]),
    ).rejects.toThrow(/Not enough stock for Áo thun. Available: 2/);

    expect(tx.decrementProductStock).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5])(
    "từ chối số lượng không hợp lệ: %s",
    async (quantity) => {
      const service = new StockReservationService();

      await expect(
        service.reserveStock(tx, [
          {
            productId: "prod-1",
            quantity,
          },
        ]),
      ).rejects.toThrow(ValidationError);

      expect(tx.decrementProductStock).not.toHaveBeenCalled();
    },
  );

  it("từ chối sản phẩm inactive", async () => {
    tx = createTransaction({
      lockProductsForUpdate: vi.fn().mockResolvedValue([
        lockedProduct({
          isActive: false,
        }),
      ]),
    });

    const service = new StockReservationService();

    await expect(
      service.reserveStock(tx, [
        {
          productId: "prod-1",
          quantity: 1,
        },
      ]),
    ).rejects.toThrow(ValidationError);

    expect(tx.decrementProductStock).not.toHaveBeenCalled();
  });

  it("kiểm tra toàn bộ giỏ trước khi trừ — một item thiếu hàng thì không trừ item nào", async () => {
    tx = createTransaction({
      lockProductsForUpdate: vi.fn().mockResolvedValue([
        lockedProduct({
          id: "prod-1",
          stock: 10,
        }),
        lockedProduct({
          id: "prod-2",
          name: "Quần",
          stock: 1,
        }),
      ]),
    });

    const service = new StockReservationService();

    await expect(
      service.reserveStock(tx, [
        {
          productId: "prod-1",
          quantity: 1,
        },
        {
          productId: "prod-2",
          quantity: 5,
        },
      ]),
    ).rejects.toThrow(ValidationError);

    expect(tx.decrementProductStock).not.toHaveBeenCalled();
  });

  it("mua đúng bằng số tồn kho là hợp lệ và trả về product snapshot đã lock", async () => {
    const product = lockedProduct({
      stock: 3,
    });

    tx = createTransaction({
      lockProductsForUpdate: vi.fn().mockResolvedValue([product]),
    });

    const service = new StockReservationService();

    await expect(
      service.reserveStock(tx, [
        {
          productId: "prod-1",
          quantity: 3,
        },
      ]),
    ).resolves.toEqual([product]);
  });

  it("version đã bị thay đổi bởi giao dịch khác → ConflictError yêu cầu retry", async () => {
    tx = createTransaction({
      decrementProductStock: vi.fn().mockResolvedValue(false),
    });

    const service = new StockReservationService();

    await expect(
      service.reserveStock(tx, [
        {
          productId: "prod-1",
          quantity: 1,
        },
      ]),
    ).rejects.toThrow(ConflictError);
  });

  it("trừ kho cho từng item trong giỏ nhiều sản phẩm", async () => {
    tx = createTransaction({
      lockProductsForUpdate: vi.fn().mockResolvedValue([
        lockedProduct({
          id: "prod-1",
        }),
        lockedProduct({
          id: "prod-2",
          name: "Quần",
        }),
      ]),
    });

    const service = new StockReservationService();

    await service.reserveStock(tx, [
      {
        productId: "prod-1",
        quantity: 1,
      },
      {
        productId: "prod-2",
        quantity: 2,
      },
    ]);

    expect(tx.decrementProductStock).toHaveBeenCalledTimes(2);

    expect(tx.persistProductEvent).toHaveBeenCalledTimes(2);
  });
});
