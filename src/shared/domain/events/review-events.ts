import { BaseDomainEvent } from "./domain-event";

export class ReviewCreatedEvent extends BaseDomainEvent {
  static readonly eventName = "ReviewCreated";

  constructor(public readonly productId: string) {
    super(productId, "ReviewCreated");
  }
}

export class ReviewDeletedEvent extends BaseDomainEvent {
  static readonly eventName = "ReviewDeleted";

  constructor(public readonly productId: string) {
    super(productId, "ReviewDeleted");
  }
}
