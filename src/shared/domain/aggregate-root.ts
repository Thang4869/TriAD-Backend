import { DomainEvent } from "./events/domain-event";

export abstract class AggregateRoot<TId extends string = string> {
  private _domainEvents: DomainEvent[] = [];
  private _version = 0;

  protected constructor(public readonly id: TId) {}

  /**
   * Persisted optimistic-concurrency version.
   *
   * This value represents the version stored by the persistence layer.
   * Raising domain events must never mutate it. Event ordering is represented
   * by the order of entries in the domain-event buffer, not by this version.
   */
  get version(): number {
    return this._version;
  }

  get domainEvents(): ReadonlyArray<DomainEvent> {
    return this._domainEvents;
  }

  protected raise(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  pullEvents(): DomainEvent[] {
    const events = this._domainEvents;
    this._domainEvents = [];
    return events;
  }

  protected setVersionFromPersistence(version: number): void {
    this._version = version;
  }
}
