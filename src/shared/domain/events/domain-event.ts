export interface DomainEvent {
  eventName: string;
  occurredAt: Date;
  aggregateId: string;
  version?: number;
  sourceVersion?: number;
  metadata?: Record<string, unknown>;
}

export abstract class BaseDomainEvent implements DomainEvent {
  public readonly eventName: string;
  public readonly occurredAt: Date;
  public readonly aggregateId: string;
  public readonly version?: number;
  public readonly sourceVersion?: number;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    aggregateId: string,
    eventName: string,
    metadata?: Record<string, unknown>,
  ) {
    this.aggregateId = aggregateId;
    this.eventName = eventName;
    this.occurredAt = new Date();
    this.metadata = metadata;
  }
}
