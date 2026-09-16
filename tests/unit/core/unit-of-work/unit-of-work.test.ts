import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  UnitOfWork,
  RepositoryBase,
  persistDomainEvents,
  TxClient,
} from "@core/unit-of-work/unit-of-work";
import { AggregateRoot } from "@shared/domain/aggregate-root";
import { BaseDomainEvent } from "@shared/domain/events/domain-event";
import prisma from "@core/database/prisma";
import { logger } from "@core/logger/winston";

vi.mock("@core/database/prisma", () => ({
  default: {
    $transaction: vi.fn(),
    user: { findUnique: vi.fn() },
  },
}));

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

class FakeRepo extends RepositoryBase {
  requireTx(): TxClient {
    return this.tx;
  }
  anyDb(): unknown {
    return this.db;
  }
}

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
    const a = new FakeAggregate("a1");
    a.emit();

    await persistDomainEvents(tx, [a]);
    await persistDomainEvents(tx, [a]);

    expect(tx.outboxEvent.createMany).toHaveBeenCalledTimes(1);
    expect(a.domainEvents).toHaveLength(0);
  });

  it("logs and rethrows when the outbox write fails", async () => {
    const tx = makeTx();
    const boom = new Error("outbox table missing");
    tx.outboxEvent.createMany.mockRejectedValueOnce(boom);
    const a = new FakeAggregate("a1");
    a.emit("EventA");

    await expect(persistDomainEvents(tx, [a])).rejects.toThrow(boom);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to write domain events"),
      expect.objectContaining({ error: boom, events: ["EventA"] }),
    );
  });
});

describe("UnitOfWork.run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (fn: any) => fn(makeTx())) as any,
    );
  });

  it("returns the callback result and exposes the tx inside the callback", async () => {
    let seen: TxClient | undefined;
    const result = await UnitOfWork.run(async (tx) => {
      seen = UnitOfWork.current;
      expect(seen).toBe(tx);
      return "done";
    });

    expect(result).toBe("done");
  });

  it("applies the default timeout of 10s and no isolation level", async () => {
    await UnitOfWork.run(async () => 1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: undefined,
      timeout: 10_000,
    });
  });

  it("forwards custom isolationLevel and timeout", async () => {
    await UnitOfWork.run(async () => 1, {
      isolationLevel: "Serializable",
      timeout: 3_000,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      timeout: 3_000,
    });
  });

  it("persists events of the aggregates selected from the result", async () => {
    const tx = makeTx();
    vi.mocked(prisma.$transaction).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (fn: any) => fn(tx)) as any,
    );

    await UnitOfWork.run(
      async () => {
        const agg = new FakeAggregate("a1");
        agg.emit("Created");
        return agg;
      },
      { aggregates: (agg) => [agg] },
    );

    expect(tx.outboxEvent.createMany).toHaveBeenCalledTimes(1);
  });

  it("skips the outbox when no aggregates selector is given", async () => {
    const tx = makeTx();
    vi.mocked(prisma.$transaction).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (fn: any) => fn(tx)) as any,
    );

    await UnitOfWork.run(async () => "no aggregates");
    expect(tx.outboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("propagates errors thrown inside the transaction", async () => {
    await expect(
      UnitOfWork.run(async () => {
        throw new Error("business rule violated");
      }),
    ).rejects.toThrow("business rule violated");
  });

  it("clears the context after the transaction ends", async () => {
    await UnitOfWork.run(async () => 1);
    expect(UnitOfWork.current).toBeUndefined();
  });

  it("returns undefined for current outside any transaction", () => {
    expect(UnitOfWork.current).toBeUndefined();
  });
});

describe("RepositoryBase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (fn: any) => fn(makeTx())) as any,
    );
  });

  it("throws when tx is used outside UnitOfWork.run", () => {
    const repo = new FakeRepo();
    expect(() => repo.requireTx()).toThrow(/No active transaction/);
  });

  it("returns the active tx when inside UnitOfWork.run", async () => {
    const repo = new FakeRepo();
    await UnitOfWork.run(async (tx) => {
      expect(repo.requireTx()).toBe(tx);
      expect(repo.anyDb()).toBe(tx);
    });
  });

  it("falls back to the global prisma client for db outside a transaction", () => {
    const repo = new FakeRepo();
    expect(repo.anyDb()).toBe(prisma);
  });
});
