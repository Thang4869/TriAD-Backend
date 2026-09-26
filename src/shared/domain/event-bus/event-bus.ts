import { DomainEvent } from "../events/domain-event";

type EventHandler<T extends DomainEvent = DomainEvent> = (
  event: T,
) => Promise<void> | void;

interface HandlerEntry {
  name: string;
  fn: EventHandler<DomainEvent>;
}

export interface HandlerExecutionTracker {
  hasSucceeded(eventId: string, handlerName: string): Promise<boolean>;
  recordResult(
    eventId: string,
    handlerName: string,
    result: { success: true } | { success: false; error: string },
  ): Promise<void>;
}

export interface PublishOptions {
  eventId?: string;
  tracker?: HandlerExecutionTracker;
}

export interface PublishResult {
  success: boolean;
  failedHandlers: string[];
}

export class EventBus {
  private readonly handlers: Map<string, HandlerEntry[]> = new Map();

  constructor() {}
  /**
   * @param handlerName Định danh ỔN ĐỊNH của handler (không đổi giữa các lần
   * deploy) — dùng làm khóa idempotency cùng với eventId. KHÔNG dùng
   * `fn.name` của một arrow function/bound method vì có thể bị minify hoặc
   * đổi tên khi refactor; hãy truyền một chuỗi literal rõ ràng, ví dụ
   * `"OrderPlacedHandler"`.
   */
  subscribe<T extends DomainEvent>(
    eventName: string,
    handlerName: string,
    handler: EventHandler<T>,
  ): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers
      .get(eventName)!
      .push({ name: handlerName, fn: handler as EventHandler<DomainEvent> });
  }

  async publish(
    event: DomainEvent,
    options: PublishOptions = {},
  ): Promise<PublishResult> {
    const handlers = this.handlers.get(event.eventName) || [];
    if (handlers.length === 0) {
      return { success: true, failedHandlers: [] };
    }

    const { eventId, tracker } = options;
    const failedHandlers: string[] = [];

    await Promise.allSettled(
      handlers.map(async ({ name, fn }) => {
        if (eventId && tracker) {
          const alreadyDone = await tracker.hasSucceeded(eventId, name);
          if (alreadyDone) {
            return;
          }
        }
        try {
          await fn(event);
          if (eventId && tracker) {
            await tracker.recordResult(eventId, name, { success: true });
          }
        } catch (error) {
          failedHandlers.push(name);
          const message =
            error instanceof Error ? error.message : String(error);
          if (eventId && tracker) {
            await tracker.recordResult(eventId, name, {
              success: false,
              error: message,
            });
          }
        }
      }),
    );

    return { success: failedHandlers.length === 0, failedHandlers };
  }
}
