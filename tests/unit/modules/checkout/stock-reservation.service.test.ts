import { describe, it, expect, vi, beforeEach } from "vitest";
import { StockReservationService } from "@modules/checkout/services/stock-reservation.service";
import { IdempotencyService } from "@modules/checkout/services/idempotency.service";
import {
  ICheckoutRepository,
  TxClient,
} from "@modules/checkout/checkout.repository";
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from "@shared/utils/errors";

// withSpan chỉ là lớp bọc tracing — thay bằng passthrough để test tập trung vào logic.
vi.mock("@core/tracing/span", () => ({
  withSpan: vi.fn(
    (_name: string, fn: (set: (a: unknown) => void) => Promise<unknown>) =>
      fn(() => undefined),
  ),
}));

const tx = {} as TxClient;

function lockedProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod-1",
    name: "Áo thun",
    stock: 10,
    version: 1,
    price: 100_000,
    ...overrides,
  };
}

function createRepository(
  overrides: Partial<ICheckoutRepository> = {},
): ICheckoutRepository {
  return {
    lockProductsForUpdate: vi.fn().mockResolvedValue([lockedProduct()]),
    decrementProductStock: vi.fn().mockResolvedValue(true),
    findCachedOrderId: vi.fn().mockResolvedValue(null),
    cacheOrderId: vi.fn().mockResolvedValue(undefined),
    findOrderWithItems: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as ICheckoutRepository;
}

describe("StockReservationService.reserveStock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("giỏ hàng rỗng bị chặn ngay, không khoá sản phẩm nào", async () => {
    const repository = createRepository();

    await expect(
      new StockReservationService(repository).reserveStock(tx, []),
    ).rejects.toThrow(new BadRequestError("Cart is empty"));
    expect(repository.lockProductsForUpdate).not.toHaveBeenCalled();
  });

  it("khoá đúng danh sách productId trước khi trừ kho", async () => {
    const repository = createRepository({
      lockProductsForUpdate: vi
        .fn()
        .mockResolvedValue([
          lockedProduct(),
          lockedProduct({ id: "prod-2", name: "Quần" }),
        ]),
    });

    await new StockReservationService(repository).reserveStock(tx, [
      { productId: "prod-1", quantity: 1 },
      { productId: "prod-2", quantity: 2 },
    ]);

    expect(repository.lockProductsForUpdate).toHaveBeenCalledWith(tx, [
      "prod-1",
      "prod-2",
    ]);
  });

  it("trừ kho với version hiện tại để optimistic locking hoạt động", async () => {
    const repository = createRepository({
      lockProductsForUpdate: vi
        .fn()
        .mockResolvedValue([lockedProduct({ version: 7 })]),
    });

    await new StockReservationService(repository).reserveStock(tx, [
      { productId: "prod-1", quantity: 3 },
    ]);

    expect(repository.decrementProductStock).toHaveBeenCalledWith(
      tx,
      "prod-1",
      7,
      3,
    );
  });

  it("sản phẩm không tồn tại → NotFoundError, không trừ kho sản phẩm nào", async () => {
    const repository = createRepository({
      lockProductsForUpdate: vi.fn().mockResolvedValue([]),
    });

    await expect(
      new StockReservationService(repository).reserveStock(tx, [
        { productId: "prod-1", quantity: 1 },
      ]),
    ).rejects.toThrow(NotFoundError);
    expect(repository.decrementProductStock).not.toHaveBeenCalled();
  });

  it("thiếu hàng → BadRequest kèm tên sản phẩm và số lượng còn lại", async () => {
    const repository = createRepository({
      lockProductsForUpdate: vi
        .fn()
        .mockResolvedValue([lockedProduct({ stock: 2 })]),
    });

    await expect(
      new StockReservationService(repository).reserveStock(tx, [
        { productId: "prod-1", quantity: 5 },
      ]),
    ).rejects.toThrow(/Not enough stock for Áo thun. Available: 2/);
  });

  it("kiểm tra toàn bộ giỏ trước khi trừ — một item thiếu hàng thì không trừ item nào", async () => {
    const repository = createRepository({
      lockProductsForUpdate: vi
        .fn()
        .mockResolvedValue([
          lockedProduct({ id: "prod-1", stock: 10 }),
          lockedProduct({ id: "prod-2", name: "Quần", stock: 1 }),
        ]),
    });

    await expect(
      new StockReservationService(repository).reserveStock(tx, [
        { productId: "prod-1", quantity: 1 },
        { productId: "prod-2", quantity: 5 },
      ]),
    ).rejects.toThrow(BadRequestError);
    expect(repository.decrementProductStock).not.toHaveBeenCalled();
  });

  it("mua đúng bằng số tồn kho là hợp lệ", async () => {
    const repository = createRepository({
      lockProductsForUpdate: vi
        .fn()
        .mockResolvedValue([lockedProduct({ stock: 3 })]),
    });

    await expect(
      new StockReservationService(repository).reserveStock(tx, [
        { productId: "prod-1", quantity: 3 },
      ]),
    ).resolves.toBeUndefined();
  });

  it("version đã bị thay đổi bởi giao dịch khác → ConflictError yêu cầu retry", async () => {
    const repository = createRepository({
      decrementProductStock: vi.fn().mockResolvedValue(false),
    });

    await expect(
      new StockReservationService(repository).reserveStock(tx, [
        { productId: "prod-1", quantity: 1 },
      ]),
    ).rejects.toThrow(ConflictError);
  });

  it("trừ kho cho từng item trong giỏ nhiều sản phẩm", async () => {
    const repository = createRepository({
      lockProductsForUpdate: vi
        .fn()
        .mockResolvedValue([
          lockedProduct({ id: "prod-1" }),
          lockedProduct({ id: "prod-2", name: "Quần" }),
        ]),
    });

    await new StockReservationService(repository).reserveStock(tx, [
      { productId: "prod-1", quantity: 1 },
      { productId: "prod-2", quantity: 2 },
    ]);

    expect(repository.decrementProductStock).toHaveBeenCalledTimes(2);
  });
});

describe("IdempotencyService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("key rỗng thì bỏ qua, không truy vấn cache", async () => {
    const repository = createRepository();

    const result = await new IdempotencyService(
      repository,
    ).tryReturnIdempotentOrder("");

    expect(result).toBeNull();
    expect(repository.findCachedOrderId).not.toHaveBeenCalled();
  });

  it("chưa có cache thì trả null (cho phép tạo đơn mới)", async () => {
    const repository = createRepository();

    await expect(
      new IdempotencyService(repository).tryReturnIdempotentOrder("key-1"),
    ).resolves.toBeNull();
  });

  it("có cache và đơn còn tồn tại thì trả lại đơn cũ, đánh dấu idempotent", async () => {
    const order = { id: "order-1", items: [] };
    const repository = createRepository({
      findCachedOrderId: vi.fn().mockResolvedValue("order-1"),
      findOrderWithItems: vi.fn().mockResolvedValue(order),
    });

    const result = await new IdempotencyService(
      repository,
    ).tryReturnIdempotentOrder("key-1");

    expect(result).toEqual({ order, idempotent: true });
  });

  it("cache trỏ tới đơn đã bị xoá thì trả null thay vì lỗi", async () => {
    const repository = createRepository({
      findCachedOrderId: vi.fn().mockResolvedValue("order-1"),
      findOrderWithItems: vi.fn().mockResolvedValue(null),
    });

    await expect(
      new IdempotencyService(repository).tryReturnIdempotentOrder("key-1"),
    ).resolves.toBeNull();
  });

  it("cacheOrderId dùng TTL mặc định 86400 giây khi thiếu biến môi trường", async () => {
    delete process.env.IDEMPOTENCY_TTL;
    const repository = createRepository();

    await new IdempotencyService(repository).cacheOrderId("key-1", "order-1");

    expect(repository.cacheOrderId).toHaveBeenCalledWith(
      "key-1",
      "order-1",
      86_400,
    );
  });

  it("cacheOrderId đọc TTL từ biến môi trường IDEMPOTENCY_TTL", async () => {
    process.env.IDEMPOTENCY_TTL = "60";
    const repository = createRepository();

    await new IdempotencyService(repository).cacheOrderId("key-1", "order-1");

    expect(repository.cacheOrderId).toHaveBeenCalledWith(
      "key-1",
      "order-1",
      60,
    );
    delete process.env.IDEMPOTENCY_TTL;
  });
});
