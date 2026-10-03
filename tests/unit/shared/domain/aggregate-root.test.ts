import { describe, it, expect } from "vitest";
import { AggregateRoot } from "@shared/domain/aggregate-root";
import { BaseDomainEvent } from "@shared/domain/events/domain-event";

class Thing extends BaseDomainEvent {
  constructor(id: string) {
    super(id, "ThingHappened");
  }
}

class Sample extends AggregateRoot {
  constructor(id = "agg-1") {
    super(id);
  }
  doSomething(): void {
    this.raise(new Thing(this.id));
  }
  restoreVersion(v: number): void {
    this.setVersionFromPersistence(v);
  }
}

describe("AggregateRoot", () => {
  it("starts with no events and version 0", () => {
    const agg = new Sample();
    expect(agg.id).toBe("agg-1");
    expect(agg.domainEvents).toEqual([]);
    expect(agg.version).toBe(0);
  });

  it("does not change persisted version when domain events are raised", () => {
    const agg = new Sample();

    agg.doSomething();
    agg.doSomething();

    expect(agg.version).toBe(0);
    expect(agg.domainEvents).toHaveLength(2);
  });

  it("pullEvents returns the events and empties the buffer", () => {
    const agg = new Sample();
    agg.doSomething();

    const events = agg.pullEvents();

    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe("ThingHappened");
    expect(agg.domainEvents).toEqual([]);
    expect(agg.pullEvents()).toEqual([]);
  });

  it("pulling events does not affect persisted version", () => {
    const agg = new Sample();

    agg.doSomething();
    agg.pullEvents();

    expect(agg.version).toBe(0);
  });

  it("keeps the persisted version stable when new events are raised", () => {
    const agg = new Sample();

    agg.restoreVersion(7);
    expect(agg.version).toBe(7);

    agg.doSomething();

    expect(agg.version).toBe(7);
    expect(agg.domainEvents).toHaveLength(1);
  });

  it("keeps event buffers independent per instance", () => {
    const a = new Sample("a");
    const b = new Sample("b");
    a.doSomething();
    expect(b.domainEvents).toEqual([]);
    expect(a.domainEvents).toHaveLength(1);
  });
});
