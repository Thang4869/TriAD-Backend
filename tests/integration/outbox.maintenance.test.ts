import { describe, expect, it } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaOutboxMaintenanceStore } from "@core/outbox/prisma-outbox-maintenance.store";

function outboxEvent(
  id: string,
  state: {
    publishedAt?: Date | null;
    deadLetteredAt?: Date | null;
    attempts?: number;
    lockedAt?: Date | null;
    lockOwner?: string | null;
    leaseUntil?: Date | null;
    lastError?: string | null;
  } = {},
) {
  const occurredAt = new Date("2026-10-01T00:00:00.000Z");

  return {
    id,
    eventName: "MaintenanceTestEvent",
    aggregateId: `aggregate-${id}`,
    payload: {
      eventName: "MaintenanceTestEvent",
      aggregateId: `aggregate-${id}`,
      occurredAt: occurredAt.toISOString(),
      sourceVersion: 1,
    },
    occurredAt,
    publishedAt: state.publishedAt ?? null,
    deadLetteredAt: state.deadLetteredAt ?? null,
    attempts: state.attempts ?? 0,
    lockedAt: state.lockedAt ?? null,
    lockOwner: state.lockOwner ?? null,
    leaseUntil: state.leaseUntil ?? null,
    lastError: state.lastError ?? null,
  };
}

describe("PrismaOutboxMaintenanceStore (integration, real DB)", () => {
  const store = new PrismaOutboxMaintenanceStore();

  it("returns only unpublished dead-letter events from the requested ids", async () => {
    const deadLetteredAt = new Date("2026-10-02T00:00:00.000Z");

    await prisma.outboxEvent.createMany({
      data: [
        outboxEvent("maintenance-dead-1", {
          attempts: 10,
          deadLetteredAt,
          lastError: "handler failed",
        }),
        outboxEvent("maintenance-pending"),
        outboxEvent("maintenance-published", {
          publishedAt: new Date("2026-10-02T01:00:00.000Z"),
        }),
      ],
    });

    await expect(
      store.findDeadLettersByIds([
        "maintenance-dead-1",
        "maintenance-pending",
        "maintenance-published",
        "missing-event",
      ]),
    ).resolves.toEqual([
      {
        id: "maintenance-dead-1",
        eventName: "MaintenanceTestEvent",
        aggregateId: "aggregate-maintenance-dead-1",
        attempts: 10,
        occurredAt: new Date("2026-10-01T00:00:00.000Z"),
        deadLetteredAt,
        lastError: "handler failed",
      },
    ]);
  });

  it("requeues the complete dead-letter selection while preserving event identity and handler logs", async () => {
    const deadLetteredAt = new Date("2026-10-02T00:00:00.000Z");

    await prisma.outboxEvent.createMany({
      data: [
        outboxEvent("maintenance-replay-1", {
          attempts: 10,
          deadLetteredAt,
          lastError: "first failure",
        }),
        outboxEvent("maintenance-replay-2", {
          attempts: 10,
          deadLetteredAt,
          lastError: "second failure",
        }),
      ],
    });

    await prisma.outboxHandlerLog.createMany({
      data: [
        {
          outboxEventId: "maintenance-replay-1",
          handlerName: "AlreadySuccessfulHandler",
          status: "SUCCESS",
        },
        {
          outboxEventId: "maintenance-replay-1",
          handlerName: "FailedHandler",
          status: "FAILED",
          error: "first failure",
        },
      ],
    });

    await expect(
      store.requeueDeadLetters([
        "maintenance-replay-1",
        "maintenance-replay-2",
      ]),
    ).resolves.toEqual(["maintenance-replay-1", "maintenance-replay-2"]);

    const rows = await prisma.outboxEvent.findMany({
      where: {
        id: {
          in: ["maintenance-replay-1", "maintenance-replay-2"],
        },
      },
      orderBy: {
        id: "asc",
      },
    });

    expect(rows).toHaveLength(2);

    for (const row of rows) {
      expect(row).toMatchObject({
        publishedAt: null,
        attempts: 0,
        deadLetteredAt: null,
        lastError: null,
        lockedAt: null,
        lockOwner: null,
        leaseUntil: null,
      });
    }

    expect(rows.map((row) => row.id)).toEqual([
      "maintenance-replay-1",
      "maintenance-replay-2",
    ]);

    await expect(
      prisma.outboxHandlerLog.findMany({
        where: {
          outboxEventId: "maintenance-replay-1",
        },
        orderBy: {
          handlerName: "asc",
        },
        select: {
          handlerName: true,
          status: true,
          error: true,
        },
      }),
    ).resolves.toEqual([
      {
        handlerName: "AlreadySuccessfulHandler",
        status: "SUCCESS",
        error: null,
      },
      {
        handlerName: "FailedHandler",
        status: "FAILED",
        error: "first failure",
      },
    ]);
  });

  it("does not partially requeue when any requested event is not eligible", async () => {
    const deadLetteredAt = new Date("2026-10-02T00:00:00.000Z");

    await prisma.outboxEvent.createMany({
      data: [
        outboxEvent("maintenance-atomic-dead", {
          attempts: 10,
          deadLetteredAt,
          lastError: "still dead",
        }),
        outboxEvent("maintenance-atomic-pending"),
      ],
    });

    await expect(
      store.requeueDeadLetters([
        "maintenance-atomic-dead",
        "maintenance-atomic-pending",
      ]),
    ).resolves.toEqual([]);

    await expect(
      prisma.outboxEvent.findUnique({
        where: {
          id: "maintenance-atomic-dead",
        },
      }),
    ).resolves.toMatchObject({
      attempts: 10,
      deadLetteredAt,
      lastError: "still dead",
    });
  });

  it("counts and deletes only published events older than the retention cutoff", async () => {
    const cutoff = new Date("2026-10-02T00:00:00.000Z");

    await prisma.outboxEvent.createMany({
      data: [
        outboxEvent("maintenance-old-published", {
          publishedAt: new Date("2026-09-01T00:00:00.000Z"),
        }),
        outboxEvent("maintenance-recent-published", {
          publishedAt: new Date("2026-10-03T00:00:00.000Z"),
        }),
        outboxEvent("maintenance-pending-old"),
        outboxEvent("maintenance-dead-old", {
          attempts: 10,
          deadLetteredAt: new Date("2026-09-01T00:00:00.000Z"),
        }),
        outboxEvent("maintenance-leased-old", {
          lockedAt: new Date(),
          lockOwner: "worker-1",
          leaseUntil: new Date(Date.now() + 60_000),
        }),
      ],
    });

    await prisma.outboxHandlerLog.create({
      data: {
        outboxEventId: "maintenance-old-published",
        handlerName: "PublishedHandler",
        status: "SUCCESS",
      },
    });

    await expect(store.countPublishedBefore(cutoff)).resolves.toBe(1);

    await expect(store.deletePublishedBefore(cutoff, 100)).resolves.toEqual([
      "maintenance-old-published",
    ]);

    await expect(
      prisma.outboxEvent.findMany({
        orderBy: {
          id: "asc",
        },
        select: {
          id: true,
        },
      }),
    ).resolves.toEqual([
      { id: "maintenance-dead-old" },
      { id: "maintenance-leased-old" },
      { id: "maintenance-pending-old" },
      { id: "maintenance-recent-published" },
    ]);

    await expect(
      prisma.outboxHandlerLog.count({
        where: {
          outboxEventId: "maintenance-old-published",
        },
      }),
    ).resolves.toBe(0);
  });

  it("respects the cleanup batch limit", async () => {
    const cutoff = new Date("2026-10-02T00:00:00.000Z");

    await prisma.outboxEvent.createMany({
      data: [
        outboxEvent("maintenance-limit-1", {
          publishedAt: new Date("2026-09-01T00:00:00.000Z"),
        }),
        outboxEvent("maintenance-limit-2", {
          publishedAt: new Date("2026-09-02T00:00:00.000Z"),
        }),
      ],
    });

    await expect(store.deletePublishedBefore(cutoff, 1)).resolves.toEqual([
      "maintenance-limit-1",
    ]);

    await expect(store.countPublishedBefore(cutoff)).resolves.toBe(1);
  });
});
