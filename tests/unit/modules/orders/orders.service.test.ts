import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderStatus } from "@prisma/client";

import { OrdersService } from "@modules/orders/orders.service";
import { IOrdersRepository } from "@modules/orders/application/ports/orders.repository.port";
import type {
  OrderHistoryReadPort,
  OrderHistoryView,
} from "@modules/orders/application/order-history-read.port";
import { EventBus } from "@shared/domain/event-bus/event-bus";
import { NotFoundError } from "@shared/utils/errors";

vi.mock("@core/logger/winston", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const ORDER = {
  id: "order-1",
  orderNumber: "ORD-TEST-1",
  userId: "user-1",
  status: OrderStatus.PENDING,
  version: 0,
  paymentMethod: "COD",
  paymentStatus: "PENDING",
  subtotal: 100,
  tax: 0,
  shippingFee: 0,
  total: 100,
  discountAmount: 0,
  discountCode: null,
  customerName: "Test User",
  customerEmail: "test@example.com",
  customerPhone: "0123456789",
  customerAddress: "Test Address",
  notes: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  items: [],
};

const ORDER_HISTORY: OrderHistoryView = {
  orderId: "order-1",
  userId: "user-1",
  orderNumber: "ORD-TEST-1",
  status: OrderStatus.PENDING,
  paymentStatus: "PENDING",
  subtotal: 100,
  tax: 0,
  shippingFee: 0,
  total: 100,
  items: [],
  placedAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const eventBus = {
  publish: vi.fn().mockResolvedValue({
    success: true,
    failedHandlers: [],
  }),
} as unknown as EventBus;

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
    updateStatusWithEvents: vi
      .fn()
      .mockImplementation(async (_orderId, _expectedVersion, aggregate) => ({
        ...ORDER,
        status: aggregate.status,
        version: aggregate.version,
      })),
    ...overrides,
  } as unknown as IOrdersRepository;
}

function createReadPort(
  overrides: Partial<OrderHistoryReadPort> = {},
): OrderHistoryReadPort {
  return {
    findByUser: vi.fn().mockResolvedValue([]),
    countByUser: vi.fn().mockResolvedValue(0),
    findByIdAndUser: vi.fn().mockResolvedValue(ORDER_HISTORY),
    ...overrides,
  };
}

function createService(
  repository = createRepository(),
  readPort = createReadPort(),
) {
  return new OrdersService(repository, readPort);
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(eventBus.publish).mockResolvedValue({
    success: true,
    failedHandlers: [],
  });
});

describe("OrdersService.getOrders", () => {
  it("mặc định page 1, limit 10", async () => {
    const repository = createRepository();
    const readPort = createReadPort();

    const result = await createService(repository, readPort).getOrders(
      "user-1",
    );

    expect(readPort.findByUser).toHaveBeenCalledWith("user-1", 0, 10);
    expect(result).toMatchObject({
      page: 1,
      limit: 10,
    });
  });

  it("tính skip theo trang", async () => {
    const repository = createRepository();
    const readPort = createReadPort();

    await createService(repository, readPort).getOrders("user-1", 3, 5);

    expect(readPort.findByUser).toHaveBeenCalledWith("user-1", 10, 5);
  });

  it("totalPages làm tròn lên theo tổng số đơn", async () => {
    const repository = createRepository();
    const readPort = createReadPort({
      countByUser: vi.fn().mockResolvedValue(21),
    });

    const result = await createService(repository, readPort).getOrders(
      "user-1",
      1,
      10,
    );

    expect(result.totalPages).toBe(3);
    expect(result.total).toBe(21);
  });

  it("người dùng chưa có đơn nào thì totalPages = 0", async () => {
    const repository = createRepository();

    const result = await createService(repository).getOrders("user-1");

    expect(result.totalPages).toBe(0);
    expect(result.orders).toEqual([]);
  });
});

describe("OrdersService.getOrderById", () => {
  it("tra cứu theo cả orderId lẫn userId để tránh xem trộm đơn người khác", async () => {
    const repository = createRepository();
    const readPort = createReadPort();

    await createService(repository, readPort).getOrderById("order-1", "user-1");

    expect(readPort.findByIdAndUser).toHaveBeenCalledWith("order-1", "user-1");
  });

  it("không tìm thấy (hoặc không thuộc về user) → NotFoundError", async () => {
    const repository = createRepository();
    const readPort = createReadPort({
      findByIdAndUser: vi.fn().mockResolvedValue(null),
    });

    await expect(
      createService(repository, readPort).getOrderById("order-1", "user-2"),
    ).rejects.toThrow(new NotFoundError("Order not found"));
  });
});

describe("OrdersService.adminGetOrders", () => {
  it("truyền filter và phân trang xuống repository", async () => {
    const repository = createRepository();
    const filters = {
      status: OrderStatus.PENDING,
      userId: "user-1",
    };

    await createService(repository).adminGetOrders(filters, 2, 20);

    expect(repository.findManyAdmin).toHaveBeenCalledWith(filters, 20, 20);
    expect(repository.countAdmin).toHaveBeenCalledWith(filters);
  });

  it("trả metadata phân trang đầy đủ", async () => {
    const repository = createRepository({
      countAdmin: vi.fn().mockResolvedValue(35),
    });

    const result = await createService(repository).adminGetOrders({}, 1, 10);

    expect(result).toMatchObject({
      total: 35,
      page: 1,
      limit: 10,
      totalPages: 4,
    });
  });
});

describe("OrdersService.updateOrderStatus", () => {
  it("chuyển PENDING → PROCESSING thông qua Order aggregate", async () => {
    const repository = createRepository();

    const result = await createService(repository).updateOrderStatus(
      "order-1",
      OrderStatus.PROCESSING,
    );

    expect(repository.updateStatusWithEvents).toHaveBeenCalledTimes(1);

    const [orderId, expectedVersion, aggregate] = vi.mocked(
      repository.updateStatusWithEvents,
    ).mock.calls[0];

    expect(orderId).toBe("order-1");
    expect(expectedVersion).toBe(0);
    expect(aggregate.status).toBe(OrderStatus.PROCESSING);
    expect(aggregate.version).toBe(1);

    expect(aggregate.domainEvents).toEqual([
      expect.objectContaining({
        eventName: "OrderStatusChanged",
        aggregateId: "order-1",
        metadata: {
          oldStatus: OrderStatus.PENDING,
          newStatus: OrderStatus.PROCESSING,
          userId: "user-1",
        },
      }),
    ]);

    expect(result.status).toBe(OrderStatus.PROCESSING);
  });

  it("đơn không tồn tại → NotFoundError, không update", async () => {
    const repository = createRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    await expect(
      createService(repository).updateOrderStatus(
        "missing",
        OrderStatus.PROCESSING,
      ),
    ).rejects.toThrow(NotFoundError);

    expect(repository.updateStatusWithEvents).not.toHaveBeenCalled();
  });

  it.each([
    [OrderStatus.DELIVERED, OrderStatus.PENDING],
    [OrderStatus.CANCELLED, OrderStatus.PROCESSING],
    [OrderStatus.PENDING, OrderStatus.DELIVERED],
    [OrderStatus.PENDING, OrderStatus.SHIPPED],
  ])("chuyển %s → %s bị domain chặn", async (from, to) => {
    const repository = createRepository({
      findById: vi.fn().mockResolvedValue({
        ...ORDER,
        status: from,
      }),
    });

    await expect(
      createService(repository).updateOrderStatus("order-1", to),
    ).rejects.toThrow();

    expect(repository.updateStatusWithEvents).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it("không publish OrderStatusChanged trực tiếp qua EventBus", async () => {
    const repository = createRepository();

    await createService(repository).updateOrderStatus(
      "order-1",
      OrderStatus.PROCESSING,
    );

    expect(repository.updateStatusWithEvents).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it("truyền version persistence làm expectedVersion cho repository", async () => {
    const repository = createRepository({
      findById: vi.fn().mockResolvedValue({
        ...ORDER,
        version: 7,
      }),
    });

    await createService(repository).updateOrderStatus(
      "order-1",
      OrderStatus.PROCESSING,
    );

    expect(repository.updateStatusWithEvents).toHaveBeenCalledWith(
      "order-1",
      7,
      expect.objectContaining({
        id: "order-1",
        status: OrderStatus.PROCESSING,
      }),
    );
  });
});
