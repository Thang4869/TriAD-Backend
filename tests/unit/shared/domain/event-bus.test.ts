import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  EventBus,
  HandlerExecutionTracker,
} from "@shared/domain/event-bus/event-bus";
import { BaseDomainEvent } from "@shared/domain/events/domain-event";

vi.mock("@core/logger/winston", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

let counter = 0;
function uniqueEventName(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}`;
}

class TestEvent extends BaseDomainEvent {
  constructor(eventName: string, aggregateId = "agg-1") {
    super(aggregateId, eventName, { source: "test" });
  }
}

function createTracker(
  overrides: Partial<HandlerExecutionTracker> = {},
): HandlerExecutionTracker {
  return {
    hasSucceeded: vi.fn().mockResolvedValue(false),
    recordResult: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("EventBus", () => {
  let bus: EventBus;
  beforeEach(() => {
    bus = new EventBus();
  });

  it("publish() event không có handler trả về success = true và không lỗi", async () => {
    const eventName = uniqueEventName("NoHandler");

    const result = await bus.publish(new TestEvent(eventName));

    expect(result).toEqual({ success: true, failedHandlers: [] });
  });

  it("gọi tất cả handler đã subscribe cho đúng eventName, bỏ qua event khác", async () => {
    const eventName = uniqueEventName("Multi");
    const otherEventName = uniqueEventName("Other");
    const handlerA = vi.fn().mockResolvedValue(undefined);
    const handlerB = vi.fn().mockResolvedValue(undefined);
    const unrelated = vi.fn();

    bus.subscribe(eventName, "HandlerA", handlerA);
    bus.subscribe(eventName, "HandlerB", handlerB);
    bus.subscribe(otherEventName, "Unrelated", unrelated);

    const event = new TestEvent(eventName);
    const result = await bus.publish(event);

    expect(handlerA).toHaveBeenCalledWith(event);
    expect(handlerB).toHaveBeenCalledWith(event);
    expect(unrelated).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("một handler lỗi không chặn handler còn lại, và được liệt kê trong failedHandlers", async () => {
    const eventName = uniqueEventName("PartialFail");
    const failing = vi.fn().mockRejectedValue(new Error("boom"));
    const succeeding = vi.fn().mockResolvedValue(undefined);

    bus.subscribe(eventName, "FailingHandler", failing);
    bus.subscribe(eventName, "OkHandler", succeeding);

    const result = await bus.publish(new TestEvent(eventName));

    expect(succeeding).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.failedHandlers).toEqual(["FailingHandler"]);
  });

  it("handler đồng bộ (không async) cũng được await bình thường", async () => {
    const eventName = uniqueEventName("SyncHandler");
    const handler = vi.fn(() => undefined);

    bus.subscribe(eventName, "SyncHandler", handler);
    const result = await bus.publish(new TestEvent(eventName));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it("có tracker: bỏ qua handler đã chạy thành công trước đó (idempotency)", async () => {
    const eventName = uniqueEventName("Idempotent");
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe(eventName, "AlreadyDoneHandler", handler);

    const tracker = createTracker({
      hasSucceeded: vi.fn().mockResolvedValue(true),
    });

    const result = await bus.publish(new TestEvent(eventName), {
      eventId: "evt-1",
      tracker,
    });

    expect(tracker.hasSucceeded).toHaveBeenCalledWith(
      "evt-1",
      "AlreadyDoneHandler",
    );
    expect(handler).not.toHaveBeenCalled();
    expect(tracker.recordResult).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("có tracker: ghi nhận SUCCESS sau khi handler chạy xong", async () => {
    const eventName = uniqueEventName("RecordSuccess");
    bus.subscribe(eventName, "OkHandler", vi.fn().mockResolvedValue(undefined));
    const tracker = createTracker();

    await bus.publish(new TestEvent(eventName), {
      eventId: "evt-2",
      tracker,
    });

    expect(tracker.recordResult).toHaveBeenCalledWith("evt-2", "OkHandler", {
      success: true,
    });
  });

  it("có tracker: ghi nhận FAILED kèm message khi handler ném lỗi", async () => {
    const eventName = uniqueEventName("RecordFail");
    bus.subscribe(
      eventName,
      "BadHandler",
      vi.fn().mockRejectedValue(new Error("db down")),
    );
    const tracker = createTracker();

    const result = await bus.publish(new TestEvent(eventName), {
      eventId: "evt-3",
      tracker,
    });

    expect(tracker.recordResult).toHaveBeenCalledWith("evt-3", "BadHandler", {
      success: false,
      error: "db down",
    });
    expect(result.failedHandlers).toEqual(["BadHandler"]);
  });

  it("lỗi không phải Error (throw string) vẫn được chuyển thành message dạng chuỗi", async () => {
    const eventName = uniqueEventName("ThrowString");
    bus.subscribe(eventName, "StringThrower", () => {
      throw "chuỗi lỗi";
    });
    const tracker = createTracker();

    await bus.publish(new TestEvent(eventName), {
      eventId: "evt-4",
      tracker,
    });

    expect(tracker.recordResult).toHaveBeenCalledWith(
      "evt-4",
      "StringThrower",
      { success: false, error: "chuỗi lỗi" },
    );
  });

  it("không truyền eventId thì tracker không được dùng dù có truyền vào options", async () => {
    const eventName = uniqueEventName("NoEventId");
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe(eventName, "Handler", handler);
    const tracker = createTracker();

    await bus.publish(new TestEvent(eventName), { tracker });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(tracker.hasSucceeded).not.toHaveBeenCalled();
    expect(tracker.recordResult).not.toHaveBeenCalled();
  });
});
