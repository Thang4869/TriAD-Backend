import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OutboxRelay } from "@core/outbox/outbox-relay";
import prisma from "@core/database/prisma";
import { EventBus } from "@shared/domain/event-bus/event-bus";
import { logger } from "@core/logger/winston";

vi.mock("@core/database/prisma", () => ({
  default: {
    $queryRaw: vi.fn(),
    outboxEvent: { updateMany: vi.fn() },
  },
}));

vi.mock("@core/logger/winston", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Giữ nguyên withRetry nhưng rút ngắn thời gian chờ để test chạy nhanh.
vi.mock("@core/circuit-breaker/circuit-breaker", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

const mockedPrisma = prisma as unknown as {
  $queryRaw: ReturnType<typeof vi.fn>;
  outboxEvent: {
    updateMany: ReturnType<typeof vi.fn>;
  };
};

function createEventBus(
  publish = vi.fn().mockResolvedValue({ success: true, failedHandlers: [] }),
) {
  return { publish } as unknown as EventBus;
}

const ROW = {
  id: "outbox-1",
  eventName: "OrderPlaced",
  aggregateId: "order-1",
  payload: {
    eventName: "OrderPlaced",
    aggregateId: "order-1",
    occurredAt: new Date().toISOString(),
  },
  attempts: 0,
};

describe("OutboxRelay.pollOnce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.outboxEvent.updateMany.mockResolvedValue({
      count: 1,
    } as never);
  });

  it("không publish gì khi không có row chờ xử lý", async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([] as never);
    const publish = vi.fn();

    await new OutboxRelay(createEventBus(publish)).pollOnce();

    expect(publish).not.toHaveBeenCalled();
    expect(mockedPrisma.outboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it("publish payload lên EventBus rồi đánh dấu publishedAt", async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([ROW] as never);
    const publish = vi
      .fn()
      .mockResolvedValue({ success: true, failedHandlers: [] });

    await new OutboxRelay(createEventBus(publish)).pollOnce();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "OrderPlaced" }),
      expect.any(Object),
    );
    const updateArg = mockedPrisma.outboxEvent.updateMany.mock.calls[0][0];
    expect(updateArg.where).toEqual(
      expect.objectContaining({ id: "outbox-1" }),
    );
    expect(updateArg.data.publishedAt).toBeInstanceOf(Date);
  });

  it("xử lý tuần tự nhiều row trong một batch", async () => {
    const rows = [ROW, { ...ROW, id: "outbox-2" }, { ...ROW, id: "outbox-3" }];
    mockedPrisma.$queryRaw.mockResolvedValue(rows as never);
    const publish = vi
      .fn()
      .mockResolvedValue({ success: true, failedHandlers: [] });

    await new OutboxRelay(createEventBus(publish)).pollOnce();

    expect(publish).toHaveBeenCalledTimes(3);
    expect(mockedPrisma.outboxEvent.updateMany).toHaveBeenCalledTimes(3);
  });

  it("publish lỗi thì tăng attempts thay vì đánh dấu đã publish", async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([ROW] as never);
    const publish = vi.fn().mockRejectedValue(new Error("bus down"));

    await new OutboxRelay(createEventBus(publish)).pollOnce();

    expect(mockedPrisma.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attempts: { increment: 1 } }),
      }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      "OutboxRelay failed to publish event, will retry",
      expect.objectContaining({ eventName: "OrderPlaced" }),
    );
  });

  it("handler failure result keeps the event retryable", async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([
      { ...ROW, occurredAt: new Date(Date.now() - 1000) },
    ] as never);
    const publish = vi
      .fn()
      .mockResolvedValue({ success: false, failedHandlers: ["HandlerB"] });

    await new OutboxRelay(createEventBus(publish)).pollOnce();

    expect(mockedPrisma.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attempts: { increment: 1 } }),
      }),
    );
    expect(mockedPrisma.outboxEvent.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publishedAt: expect.any(Date) }),
      }),
    );
  });

  it("một row lỗi không chặn các row còn lại trong batch", async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([
      ROW,
      { ...ROW, id: "outbox-2" },
    ] as never);
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error("bus down"))
      .mockResolvedValue({ success: true, failedHandlers: [] });

    await new OutboxRelay(createEventBus(publish)).pollOnce();

    expect(publish).toHaveBeenCalledTimes(2);
    expect(mockedPrisma.outboxEvent.updateMany).toHaveBeenCalledTimes(2);
  });

  it("lỗi truy vấn DB được log chứ không ném ra (timer không bị chết)", async () => {
    mockedPrisma.$queryRaw.mockRejectedValue(new Error("db down") as never);

    await expect(
      new OutboxRelay(createEventBus()).pollOnce(),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      "OutboxRelay poll failed",
      expect.any(Object),
    );
  });

  it("bỏ qua lần poll chồng lấn khi lần trước chưa xong (cờ running)", async () => {
    let resolveQuery: (value: unknown) => void = () => undefined;
    mockedPrisma.$queryRaw.mockReturnValue(
      new Promise((resolve) => {
        resolveQuery = resolve;
      }) as never,
    );
    const relay = new OutboxRelay(createEventBus());

    const first = relay.pollOnce();
    await relay.pollOnce(); // gọi chồng, phải return ngay
    resolveQuery([]);
    await first;

    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("cờ running được giải phóng sau khi poll xong để lần sau chạy tiếp", async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([] as never);
    const relay = new OutboxRelay(createEventBus());

    await relay.pollOnce();
    await relay.pollOnce();

    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});

describe("OutboxRelay.start / stop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockedPrisma.$queryRaw.mockResolvedValue([] as never);
  });

  afterEach(() => vi.useRealTimers());

  it("start() bật interval poll định kỳ", async () => {
    const relay = new OutboxRelay(createEventBus());

    relay.start();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(mockedPrisma.$queryRaw).toHaveBeenCalled();
    relay.stop();
  });

  it("gọi start() hai lần không tạo hai interval", async () => {
    const relay = new OutboxRelay(createEventBus());

    relay.start();
    relay.start();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    relay.stop();
  });

  it("stop() dừng hẳn việc poll", async () => {
    const relay = new OutboxRelay(createEventBus());
    relay.start();

    relay.stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(mockedPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("stop() khi chưa start() không gây lỗi", () => {
    expect(() => new OutboxRelay(createEventBus()).stop()).not.toThrow();
  });
});
