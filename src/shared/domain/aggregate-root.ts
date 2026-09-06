import { DomainEvent } from "./events/domain-event";

export abstract class AggregateRoot<TId extends string = string> {
  private _domainEvents: DomainEvent[] = [];
  private _version = 0;

  protected constructor(public readonly id: TId) {}

  get version(): number {
    return this._version;
  }

  get domainEvents(): ReadonlyArray<DomainEvent> {
    return this._domainEvents;
  }

  protected raise(event: DomainEvent): void {
    this._domainEvents.push(event);
    this._version++;
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
