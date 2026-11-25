import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaOutboxMaintenanceStore } from "@core/outbox/prisma-outbox-maintenance.store";

vi.mock("@core/database/prisma", () => ({
  default: {
    outboxEvent: { findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

const db = prisma as unknown as {
  outboxEvent: {
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
  $queryRaw: ReturnType<typeof vi.fn>;
};

describe("PrismaOutboxMaintenanceStore", () => {
  const store = new PrismaOutboxMaintenanceStore();
  const deadLetterRow = {
    id: "event-1",
    eventName: "OrderPlaced",
    aggregateId: "order-1",
    attempts: 4,
    occurredAt: new Date("2026-10-01T00:00:00.000Z"),
    deadLetteredAt: new Date("2026-10-02T00:00:00.000Z"),
    lastError: "handler failed",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db.outboxEvent.findMany.mockResolvedValue([deadLetterRow]);
    db.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
    db.outboxEvent.count.mockResolvedValue(3);
    db.$queryRaw.mockResolvedValue([]);
    db.$transaction.mockImplementation((callback) =>
      callback({
        $queryRaw: db.$queryRaw,
        outboxEvent: { updateMany: db.outboxEvent.updateMany },
      }),
    );
  });

  it("returns no dead letters for an empty id list", async () => {
    await expect(store.findDeadLettersByIds([])).resolves.toEqual([]);
    expect(db.outboxEvent.findMany).not.toHaveBeenCalled();
  });

  it("deduplicates ids and omits rows no longer dead-lettered", async () => {
    db.outboxEvent.findMany.mockResolvedValue([
      deadLetterRow,
      { ...deadLetterRow, id: "event-2", deadLetteredAt: null },
    ]);
    await expect(
      store.findDeadLettersByIds(["event-1", "event-1", "event-2"]),
    ).resolves.toEqual([deadLetterRow]);
    expect(db.outboxEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ["event-1", "event-2"] },
          publishedAt: null,
          deadLetteredAt: { not: null },
        },
      }),
    );
  });

  it("does not transact an empty replay selection", async () => {
    await expect(store.requeueDeadLetters([])).resolves.toEqual([]);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("atomically requeues a complete locked selection", async () => {
    db.outboxEvent.updateMany.mockResolvedValue({ count: 2 });
    db.$queryRaw.mockResolvedValue([{ id: "event-1" }, { id: "event-2" }]);
    await expect(
      store.requeueDeadLetters(["event-1", "event-1", "event-2"]),
    ).resolves.toEqual(["event-1", "event-2"]);
    expect(db.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["event-1", "event-2"] } }),
        data: expect.objectContaining({
          attempts: 0,
          deadLetteredAt: null,
          lastError: null,
          lockedAt: null,
          lockOwner: null,
          leaseUntil: null,
        }),
      }),
    );
  });

  it("returns empty when the locked selection is incomplete", async () => {
    db.$queryRaw.mockResolvedValue([{ id: "event-1" }]);
    await expect(
      store.requeueDeadLetters(["event-1", "event-2"]),
    ).resolves.toEqual([]);
    expect(db.outboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it("throws if the selected rows change during requeue", async () => {
    db.$queryRaw.mockResolvedValue([{ id: "event-1" }]);
    db.outboxEvent.updateMany.mockResolvedValue({ count: 0 });
    await expect(store.requeueDeadLetters(["event-1"])).rejects.toThrow(
      "Outbox dead-letter replay selection changed while requeueing",
    );
  });

  it("counts published events before the cutoff", async () => {
    const cutoff = new Date("2026-10-01T00:00:00.000Z");
    await expect(store.countPublishedBefore(cutoff)).resolves.toBe(3);
    expect(db.outboxEvent.count).toHaveBeenCalledWith({
      where: { publishedAt: { not: null, lt: cutoff } },
    });
  });

  it("skips deletion for a non-positive limit", async () => {
    await expect(store.deletePublishedBefore(new Date(), 0)).resolves.toEqual(
      [],
    );
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns ids deleted by the bounded cleanup query", async () => {
    const cutoff = new Date("2026-10-01T00:00:00.000Z");
    db.$queryRaw.mockResolvedValue([{ id: "event-1" }, { id: "event-2" }]);
    await expect(store.deletePublishedBefore(cutoff, 2)).resolves.toEqual([
      "event-1",
      "event-2",
    ]);
    expect(db.$queryRaw).toHaveBeenCalledOnce();
  });
});
