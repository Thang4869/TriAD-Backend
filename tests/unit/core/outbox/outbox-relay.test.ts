import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OutboxRelay } from "@core/outbox/outbox-relay";
import {
  EventBus,
  HandlerExecutionTracker,
} from "@shared/domain/event-bus/event-bus";
import { logger } from "@core/logger/winston";
import { OutboxRelayStore } from "@core/outbox/outbox-relay-store.port";

vi.mock("@core/logger/winston", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Giữ nguyên withRetry nhưng rút ngắn thời gian chờ để test chạy nhanh.
vi.mock("@core/circuit-breaker/circuit-breaker", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

function createStore(): OutboxRelayStore {
  return {
    claimBatch: vi.fn(),
    updateClaimed: vi.fn(),
  };
}

function createHandlerTracker(): HandlerExecutionTracker {
  return {
    hasSucceeded: vi.fn().mockResolvedValue(false),
    recordResult: vi.fn().mockResolvedValue(undefined),
  };
}

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

let store: OutboxRelayStore;
let handlerTracker: HandlerExecutionTracker;

describe("OutboxRelay.pollOnce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = createStore();
    handlerTracker = createHandlerTracker();
  });

  it("không publish gì khi không có row chờ xử lý", async () => {
    vi.mocked(store.claimBatch).mockResolvedValue([] as never);
    const publish = vi.fn();

    await new OutboxRelay(
      store,
      handlerTracker,
      createEventBus(publish),
    ).pollOnce();

    expect(publish).not.toHaveBeenCalled();
    expect(vi.mocked(store.updateClaimed)).not.toHaveBeenCalled();
  });

  it("publish payload lên EventBus rồi đánh dấu publishedAt", async () => {
    vi.mocked(store.claimBatch).mockResolvedValue([ROW] as never);
    const publish = vi
      .fn()
      .mockResolvedValue({ success: true, failedHandlers: [] });

    await new OutboxRelay(
      store,
      handlerTracker,
      createEventBus(publish),
    ).pollOnce();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "OrderPlaced" }),
      expect.any(Object),
    );
    const [id, owner, data] = vi.mocked(store.updateClaimed).mock.calls[0];

    expect(id).toBe("outbox-1");
    expect(owner).toEqual(expect.any(String));
    expect(data.publishedAt).toBeInstanceOf(Date);
  });

  it("xử lý tuần tự nhiều row trong một batch", async () => {
    const rows = [ROW, { ...ROW, id: "outbox-2" }, { ...ROW, id: "outbox-3" }];
    vi.mocked(store.claimBatch).mockResolvedValue(rows as never);
    const publish = vi
      .fn()
      .mockResolvedValue({ success: true, failedHandlers: [] });

    await new OutboxRelay(
      store,
      handlerTracker,
      createEventBus(publish),
    ).pollOnce();

    expect(publish).toHaveBeenCalledTimes(3);
    expect(vi.mocked(store.updateClaimed)).toHaveBeenCalledTimes(3);
  });

  it("publish lỗi thì tăng attempts thay vì đánh dấu đã publish", async () => {
    vi.mocked(store.claimBatch).mockResolvedValue([ROW] as never);
    const publish = vi.fn().mockRejectedValue(new Error("bus down"));

    await new OutboxRelay(
      store,
      handlerTracker,
      createEventBus(publish),
    ).pollOnce();

    expect(vi.mocked(store.updateClaimed)).toHaveBeenCalledWith(
      "outbox-1",
      expect.any(String),
      expect.objectContaining({
        attempts: { increment: 1 },
      }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      "OutboxRelay failed to publish event, will retry",
      expect.objectContaining({ eventName: "OrderPlaced" }),
    );
  });

  it("handler failure result keeps the event retryable", async () => {
    vi.mocked(store.claimBatch).mockResolvedValue([
      { ...ROW, occurredAt: new Date(Date.now() - 1000) },
    ] as never);
    const publish = vi
      .fn()
      .mockResolvedValue({ success: false, failedHandlers: ["HandlerB"] });

    await new OutboxRelay(
      store,
      handlerTracker,
      createEventBus(publish),
    ).pollOnce();

    expect(vi.mocked(store.updateClaimed)).toHaveBeenCalledWith(
      "outbox-1",
      expect.any(String),
      expect.objectContaining({
        attempts: { increment: 1 },
      }),
    );
    expect(vi.mocked(store.updateClaimed)).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publishedAt: expect.any(Date) }),
      }),
    );
  });

  it("một row lỗi không chặn các row còn lại trong batch", async () => {
    vi.mocked(store.claimBatch).mockResolvedValue([
      ROW,
      { ...ROW, id: "outbox-2" },
    ] as never);
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error("bus down"))
      .mockResolvedValue({ success: true, failedHandlers: [] });

    await new OutboxRelay(
      store,
      handlerTracker,
      createEventBus(publish),
    ).pollOnce();

    expect(publish).toHaveBeenCalledTimes(2);
    expect(vi.mocked(store.updateClaimed)).toHaveBeenCalledTimes(2);
  });

  it("lỗi truy vấn DB được log chứ không ném ra (timer không bị chết)", async () => {
    vi.mocked(store.claimBatch).mockRejectedValue(
      new Error("db down") as never,
    );

    await expect(
      new OutboxRelay(store, handlerTracker, createEventBus()).pollOnce(),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      "OutboxRelay poll failed",
      expect.any(Object),
    );
  });

  it("bỏ qua lần poll chồng lấn khi lần trước chưa xong (cờ running)", async () => {
    let resolveQuery: (value: unknown) => void = () => undefined;
    vi.mocked(store.claimBatch).mockReturnValue(
      new Promise((resolve) => {
        resolveQuery = resolve;
      }) as never,
    );
    const relay = new OutboxRelay(store, handlerTracker, createEventBus());

    const first = relay.pollOnce();
    await relay.pollOnce(); // gọi chồng, phải return ngay
    resolveQuery([]);
    await first;

    expect(vi.mocked(store.claimBatch)).toHaveBeenCalledTimes(1);
  });

  it("cờ running được giải phóng sau khi poll xong để lần sau chạy tiếp", async () => {
    vi.mocked(store.claimBatch).mockResolvedValue([] as never);
    const relay = new OutboxRelay(store, handlerTracker, createEventBus());

    await relay.pollOnce();
    await relay.pollOnce();

    expect(vi.mocked(store.claimBatch)).toHaveBeenCalledTimes(2);
  });
});

describe("OutboxRelay.start / stop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(store.claimBatch).mockResolvedValue([] as never);
  });

  afterEach(() => vi.useRealTimers());

  it("start() bật interval poll định kỳ", async () => {
    const relay = new OutboxRelay(store, handlerTracker, createEventBus());

    relay.start();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(vi.mocked(store.claimBatch)).toHaveBeenCalled();
    relay.stop();
  });

  it("gọi start() hai lần không tạo hai interval", async () => {
    const relay = new OutboxRelay(store, handlerTracker, createEventBus());

    relay.start();
    relay.start();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(vi.mocked(store.claimBatch)).toHaveBeenCalledTimes(1);
    relay.stop();
  });

  it("stop() dừng hẳn việc poll", async () => {
    const relay = new OutboxRelay(store, handlerTracker, createEventBus());
    relay.start();

    relay.stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(vi.mocked(store.claimBatch)).not.toHaveBeenCalled();
  });

  it("stop() khi chưa start() không gây lỗi", () => {
    expect(() =>
      new OutboxRelay(store, handlerTracker, createEventBus()).stop(),
    ).not.toThrow();
  });
});
