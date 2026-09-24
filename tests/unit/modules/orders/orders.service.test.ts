import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrdersService } from "@modules/orders/orders.service";
import { IOrdersRepository } from "@modules/orders/application/ports/orders.repository.port";
import { EventBus } from "@shared/domain/event-bus/event-bus";
import { NotFoundError, BadRequestError } from "@shared/utils/errors";
import { OrderStatus } from "@prisma/client";

vi.mock("@core/logger/winston", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const ORDER = {
  id: "order-1",
  userId: "user-1",
  status: OrderStatus.PENDING,
  items: [],
};

function createRepository(
  overrides: Partial<IOrdersRepository> = {},
): IOrdersRepository {
  return {
    findByUser: vi.fn().mockResolvedValue([]),
    countByUser: vi.fn().mockResolvedValue(0),
    findByIdAndUser: vi.fn().mockResolvedValue(ORDER),
    findManyAdmin: vi.fn().mockResolvedValue([]),
    countAdmin: vi.fn().mockResolvedValue(0),
    findById: vi.fn().mockResolvedValue(ORDER),
    updateStatus: vi.fn().mockResolvedValue({
      ...ORDER,
      status: OrderStatus.PROCESSING,
    }),
    ...overrides,
  } as unknown as IOrdersRepository;
}

let publishSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  publishSpy = vi
    .spyOn(EventBus.getInstance(), "publish")
    .mockResolvedValue({ success: true, failedHandlers: [] });
});

describe("OrdersService.getOrders", () => {
  it("mặc định page 1, limit 10", async () => {
    const repository = createRepository();

    const result = await new OrdersService(repository).getOrders("user-1");

    expect(repository.findByUser).toHaveBeenCalledWith("user-1", 0, 10);
    expect(result).toMatchObject({ page: 1, limit: 10 });
  });

  it("tính skip theo trang", async () => {
    const repository = createRepository();

    await new OrdersService(repository).getOrders("user-1", 3, 5);

    expect(repository.findByUser).toHaveBeenCalledWith("user-1", 10, 5);
  });

  it("totalPages làm tròn lên theo tổng số đơn", async () => {
    const repository = createRepository({
      countByUser: vi.fn().mockResolvedValue(21),
    });

    const result = await new OrdersService(repository).getOrders(
      "user-1",
      1,
      10,
    );

    expect(result.totalPages).toBe(3);
    expect(result.total).toBe(21);
  });

  it("người dùng chưa có đơn nào thì totalPages = 0", async () => {
    const repository = createRepository();

    const result = await new OrdersService(repository).getOrders("user-1");

    expect(result.totalPages).toBe(0);
    expect(result.orders).toEqual([]);
  });
});

describe("OrdersService.getOrderById", () => {
  it("tra cứu theo cả orderId lẫn userId để tránh xem trộm đơn người khác", async () => {
    const repository = createRepository();

    await new OrdersService(repository).getOrderById("order-1", "user-1");

    expect(repository.findByIdAndUser).toHaveBeenCalledWith(
      "order-1",
      "user-1",
    );
  });

  it("không tìm thấy (hoặc không thuộc về user) → NotFoundError", async () => {
    const repository = createRepository({
      findByIdAndUser: vi.fn().mockResolvedValue(null),
    });

    await expect(
      new OrdersService(repository).getOrderById("order-1", "user-2"),
    ).rejects.toThrow(new NotFoundError("Order not found"));
  });
});

describe("OrdersService.adminGetOrders", () => {
  it("truyền filter và phân trang xuống repository", async () => {
    const repository = createRepository();
    const filters = { status: OrderStatus.PENDING, userId: "user-1" };

    await new OrdersService(repository).adminGetOrders(filters, 2, 20);

    expect(repository.findManyAdmin).toHaveBeenCalledWith(filters, 20, 20);
    expect(repository.countAdmin).toHaveBeenCalledWith(filters);
  });

  it("trả metadata phân trang đầy đủ", async () => {
    const repository = createRepository({
      countAdmin: vi.fn().mockResolvedValue(35),
    });

    const result = await new OrdersService(repository).adminGetOrders(
      {},
      1,
      10,
    );

    expect(result).toMatchObject({
      total: 35,
      page: 1,
      limit: 10,
      totalPages: 4,
    });
  });
});

describe("OrdersService.updateOrderStatus", () => {
  it("chuyển trạng thái hợp lệ PENDING → PROCESSING", async () => {
    const repository = createRepository();

    const result = await new OrdersService(repository).updateOrderStatus(
      "order-1",
      OrderStatus.PROCESSING,
    );

    expect(repository.updateStatus).toHaveBeenCalledWith(
      "order-1",
      OrderStatus.PROCESSING,
    );
    expect(result.status).toBe(OrderStatus.PROCESSING);
  });

  it("đơn không tồn tại → NotFoundError, không update", async () => {
    const repository = createRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    await expect(
      new OrdersService(repository).updateOrderStatus(
        "missing",
        OrderStatus.PROCESSING,
      ),
    ).rejects.toThrow(NotFoundError);
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });

  it.each([
    [OrderStatus.DELIVERED, OrderStatus.PENDING],
    [OrderStatus.CANCELLED, OrderStatus.PROCESSING],
    [OrderStatus.PENDING, OrderStatus.DELIVERED],
    [OrderStatus.PENDING, OrderStatus.SHIPPED],
  ])("chuyển %s → %s bị chặn bằng BadRequestError", async (from, to) => {
    const repository = createRepository({
      findById: vi.fn().mockResolvedValue({ ...ORDER, status: from }),
    });

    await expect(
      new OrdersService(repository).updateOrderStatus("order-1", to),
    ).rejects.toThrow(BadRequestError);
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });

  it("publish OrderStatusChanged với trạng thái cũ và mới", async () => {
    const repository = createRepository();

    await new OrdersService(repository).updateOrderStatus(
      "order-1",
      OrderStatus.PROCESSING,
    );

    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(publishSpy.mock.calls[0][0]).toMatchObject({
      eventName: "OrderStatusChanged",
      aggregateId: "order-1",
      metadata: {
        oldStatus: OrderStatus.PENDING,
        newStatus: OrderStatus.PROCESSING,
        userId: "user-1",
      },
    });
  });

  it("lỗi publish event không làm fail request cập nhật trạng thái", async () => {
    publishSpy.mockRejectedValue(new Error("bus down"));
    const repository = createRepository();

    await expect(
      new OrdersService(repository).updateOrderStatus(
        "order-1",
        OrderStatus.PROCESSING,
      ),
    ).resolves.toMatchObject({ status: OrderStatus.PROCESSING });
  });

  it("không publish event khi transition bị từ chối", async () => {
    const repository = createRepository({
      findById: vi
        .fn()
        .mockResolvedValue({ ...ORDER, status: OrderStatus.DELIVERED }),
    });

    await new OrdersService(repository)
      .updateOrderStatus("order-1", OrderStatus.PENDING)
      .catch(() => undefined);

    expect(publishSpy).not.toHaveBeenCalled();
  });
});
