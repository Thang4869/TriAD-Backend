import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OutboxRelay } from "@core/outbox/outbox-relay";
import {
  EventBus,
  HandlerExecutionTracker,
} from "@shared/domain/event-bus/event-bus";
import { logger } from "@core/logger/winston";
import { OutboxRelayStore } from "@core/outbox/outbox-relay-store.port";
import {
  outboxDeadLetteredEvents,
  outboxEventsFailed,
  outboxEventsPublished,
  outboxLagSeconds,
} from "@core/metrics/metrics.registry";

vi.mock("@core/logger/winston", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@core/metrics/metrics.registry", () => {
  const metric = () => ({ inc: vi.fn(), set: vi.fn() });
  return {
    outboxEventsClaimed: metric(),
    outboxEventsPublished: metric(),
    outboxEventsFailed: metric(),
    outboxEventsDeadLettered: metric(),
    outboxLagSeconds: metric(),
    outboxDeadLetteredEvents: metric(),
  };
});

function createStore(): OutboxRelayStore {
  return {
    claimBatch: vi.fn(),
    updateClaimed: vi.fn().mockResolvedValue(true),
    renewClaims: vi.fn().mockResolvedValue([]),
    getObservabilitySnapshot: vi.fn().mockResolvedValue({
      oldestPendingOccurredAt: null,
      deadLetteredCount: 0,
    }),
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
    sourceVersion: 0,
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
      expect.objectContaining({ eventName: "OrderPlaced", sourceVersion: 0 }),
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

  it("retries a logical handler failure and publishes after recovery", async () => {
    vi.mocked(store.claimBatch).mockResolvedValue([ROW] as never);
    const publish = vi
      .fn()
      .mockResolvedValueOnce({ success: false, failedHandlers: ["HandlerB"] })
      .mockResolvedValueOnce({ success: true, failedHandlers: [] });

    await new OutboxRelay(
      store,
      handlerTracker,
      createEventBus(publish),
    ).pollOnce();

    expect(publish).toHaveBeenCalledTimes(2);
    expect(store.updateClaimed).toHaveBeenCalledWith(
      "outbox-1",
      expect.any(String),
      expect.objectContaining({ publishedAt: expect.any(Date) }),
    );
    expect(outboxEventsFailed.inc).not.toHaveBeenCalled();
    expect(outboxEventsPublished.inc).toHaveBeenCalledTimes(1);
  });

  it("retries a persistent logical failure three times but records one durable failure", async () => {
    vi.mocked(store.claimBatch).mockResolvedValue([ROW] as never);
    const publish = vi
      .fn()
      .mockResolvedValue({ success: false, failedHandlers: ["HandlerB"] });

    await new OutboxRelay(
      store,
      handlerTracker,
      createEventBus(publish),
    ).pollOnce();

    expect(publish).toHaveBeenCalledTimes(3);
    expect(store.updateClaimed).toHaveBeenCalledTimes(1);
    expect(outboxEventsFailed.inc).toHaveBeenCalledTimes(1);
    expect(outboxEventsPublished.inc).not.toHaveBeenCalled();
  });

  it("does not repeat a successful sibling handler during immediate retry", async () => {
    vi.mocked(store.claimBatch).mockResolvedValue([ROW] as never);
    const succeeded = new Set<string>();
    const tracker: HandlerExecutionTracker = {
      hasSucceeded: vi.fn(async (_eventId, handlerName) =>
        succeeded.has(handlerName),
      ),
      recordResult: vi.fn(async (_eventId, handlerName, result) => {
        if (result.success) succeeded.add(handlerName);
      }),
    };
    let handlerBCalls = 0;
    let handlerACalls = 0;
    const eventBus = new EventBus();
    eventBus.subscribe("OrderPlaced", "HandlerA", async () => {
      handlerACalls += 1;
    });
    eventBus.subscribe("OrderPlaced", "HandlerB", async () => {
      handlerBCalls += 1;
      if (handlerBCalls === 1) throw new Error("transient");
    });

    await new OutboxRelay(store, tracker, eventBus).pollOnce();

    expect(handlerACalls).toBe(1);
    expect(handlerBCalls).toBe(2);
    expect(store.updateClaimed).toHaveBeenCalledWith(
      "outbox-1",
      expect.any(String),
      expect.objectContaining({ publishedAt: expect.any(Date) }),
    );
  });

  it("refreshes lag and dead-letter backlog from the snapshot when no row is claimable", async () => {
    vi.mocked(store.claimBatch).mockResolvedValue([] as never);
    vi.mocked(store.getObservabilitySnapshot).mockResolvedValue({
      oldestPendingOccurredAt: new Date(Date.now() - 5_000),
      deadLetteredCount: 3,
    });

    await new OutboxRelay(store, handlerTracker, createEventBus()).pollOnce();

    expect(outboxLagSeconds.set).toHaveBeenCalledWith(expect.any(Number));
    expect(outboxDeadLetteredEvents.set).toHaveBeenCalledWith(3);
  });

  it("does not overwrite valid metrics or block delivery when the snapshot fails", async () => {
    vi.mocked(store.claimBatch).mockResolvedValue([ROW] as never);
    vi.mocked(store.getObservabilitySnapshot).mockRejectedValue(
      new Error("metrics db down"),
    );

    await new OutboxRelay(store, handlerTracker, createEventBus()).pollOnce();

    expect(store.updateClaimed).toHaveBeenCalled();
    expect(outboxLagSeconds.set).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "Outbox observability refresh failed",
      expect.any(Object),
    );
  });

  it("dead-letters the event after the maximum number of attempts", async () => {
    vi.mocked(store.claimBatch).mockResolvedValue([
      {
        ...ROW,
        attempts: 9,
      },
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
        lockedAt: null,
        lockOwner: null,
        leaseUntil: null,
        deadLetteredAt: expect.any(Date),
        lastError: "Handlers failed: HandlerB",
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

    expect(publish).toHaveBeenCalledTimes(3);
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

  it("gia hạn lease cho toàn bộ batch khi handler còn đang chạy", async () => {
    let releasePublish!: () => void;
    const publishRelease = new Promise<void>((resolve) => {
      releasePublish = resolve;
    });
    vi.mocked(store.claimBatch).mockResolvedValue([ROW] as never);
    vi.mocked(store.renewClaims).mockResolvedValue(["outbox-1"]);
    const publish = vi.fn().mockImplementation(() =>
      publishRelease.then(() => ({
        success: true,
        failedHandlers: [],
      })),
    );
    const relay = new OutboxRelay(
      store,
      handlerTracker,
      createEventBus(publish),
      {
        leaseDurationSeconds: 1,
        heartbeatIntervalMs: 10,
      },
    );

    const poll = relay.pollOnce();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(store.renewClaims).toHaveBeenCalledWith(
      expect.any(String),
      ["outbox-1"],
      1,
    );

    releasePublish();
    await poll;
    expect(store.renewClaims).toHaveBeenCalled();
  });

  it("stops the heartbeat after the batch completes", async () => {
    vi.mocked(store.claimBatch).mockResolvedValue([ROW] as never);
    const relay = new OutboxRelay(store, handlerTracker, createEventBus(), {
      heartbeatIntervalMs: 10,
    });

    await relay.pollOnce();
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(store.renewClaims).not.toHaveBeenCalled();
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

  it("stop() khi chưa start() không gây lỗi", async () => {
    await expect(
      new OutboxRelay(store, handlerTracker, createEventBus()).stop(),
    ).resolves.toBeUndefined();
  });

  it("stop() chờ poll đang chạy hoàn thành trước khi resolve", async () => {
    let resolveClaim: (value: unknown[]) => void = () => undefined;

    vi.mocked(store.claimBatch).mockReturnValue(
      new Promise((resolve) => {
        resolveClaim = resolve;
      }) as never,
    );

    const relay = new OutboxRelay(store, handlerTracker, createEventBus());

    relay.start();

    await vi.advanceTimersByTimeAsync(2_000);

    expect(store.claimBatch).toHaveBeenCalledTimes(1);

    let stopped = false;

    const stopPromise = relay.stop().then(() => {
      stopped = true;
    });

    await Promise.resolve();

    expect(stopped).toBe(false);

    resolveClaim([]);

    await stopPromise;

    expect(stopped).toBe(true);
  });
});
