import { DomainEvent } from "../events/domain-event";
import { logger } from "@core/logger/winston";

type EventHandler<T extends DomainEvent = DomainEvent> = (
  event: T,
) => Promise<void> | void;

export class EventBus {
  private static instance: EventBus;
  private handlers: Map<string, EventHandler<DomainEvent>[]> = new Map();

  private constructor() {}

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  subscribe<T extends DomainEvent>(
    eventName: string,
    handler: EventHandler<T>,
  ): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName)!.push(handler as EventHandler<DomainEvent>);
    logger.debug(`Subscribed to event ${eventName}`);
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventName) || [];
    if (handlers.length === 0) {
      logger.debug(`No handlers for event ${event.eventName}`);
      return;
    }
    logger.info(
      `Publishing event ${event.eventName} for aggregate ${event.aggregateId}`,
    );
    await Promise.allSettled(
      handlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          logger.error(`Error handling event ${event.eventName}`, { error });
        }
      }),
    );
  }
}
