import { DomainEvent } from "@shared/domain/events/domain-event";
import {
  PublishOptions,
  PublishResult,
} from "@shared/domain/event-bus/event-bus";

export interface EventBusPort {
  publish(event: DomainEvent, options?: PublishOptions): Promise<PublishResult>;
}
