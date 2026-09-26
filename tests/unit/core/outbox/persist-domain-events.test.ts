import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { persistDomainEvents } from "@core/outbox/persist-domain-events";
import { AggregateRoot } from "@shared/domain/aggregate-root";
import { BaseDomainEvent } from "@shared/domain/events/domain-event";
import { logger } from "@core/logger/winston";

vi.mock("@core/logger/winston", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

class FakeEvent extends BaseDomainEvent {
  constructor(aggregateId: string, name = "FakeEvent") {
    super(aggregateId, name, { foo: "bar" });
  }
}

class FakeAggregate extends AggregateRoot {
  constructor(id: string) {
    super(id);
  }

  emit(name?: string): void {
    this.raise(new FakeEvent(this.id, name));
  }
}

type TxClient = Prisma.TransactionClient;

function makeTx() {
  return {
    outboxEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  } as unknown as TxClient & {
    outboxEvent: { createMany: ReturnType<typeof vi.fn> };
  };
}

describe("persistDomainEvents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing when there are no events", async () => {
    const tx = makeTx();

    await persistDomainEvents(tx, [new FakeAggregate("a1")]);

    expect(tx.outboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("does nothing when the aggregate list is empty", async () => {
    const tx = makeTx();

    await persistDomainEvents(tx, []);

    expect(tx.outboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("writes every pulled event to the outbox", async () => {
    const tx = makeTx();
    const a = new FakeAggregate("a1");
    const b = new FakeAggregate("b1");

    a.emit("EventA");
    b.emit("EventB");

    await persistDomainEvents(tx, [a, b]);

    expect(tx.outboxEvent.createMany).toHaveBeenCalledTimes(1);

    const arg = tx.outboxEvent.createMany.mock.calls[0][0];

    expect(arg.data).toHaveLength(2);
    expect(arg.data[0]).toMatchObject({
      eventName: "EventA",
      aggregateId: "a1",
    });
    expect(arg.data[1].occurredAt).toBeInstanceOf(Date);
  });

  it("drains the aggregate so events are not written twice", async () => {
    const tx = makeTx();
    const aggregate = new FakeAggregate("a1");

    aggregate.emit();

    await persistDomainEvents(tx, [aggregate]);
    await persistDomainEvents(tx, [aggregate]);

    expect(tx.outboxEvent.createMany).toHaveBeenCalledTimes(1);
    expect(aggregate.domainEvents).toHaveLength(0);
  });

  it("logs and rethrows when the outbox write fails", async () => {
    const tx = makeTx();
    const error = new Error("outbox table missing");

    tx.outboxEvent.createMany.mockRejectedValueOnce(error);

    const aggregate = new FakeAggregate("a1");
    aggregate.emit("EventA");

    await expect(persistDomainEvents(tx, [aggregate])).rejects.toThrow(error);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to write domain events"),
      expect.objectContaining({
        error,
        events: ["EventA"],
      }),
    );
  });
});
