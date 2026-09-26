import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaOutboxRelayStore } from "@core/outbox/prisma-outbox-relay.store";

vi.mock("@core/database/prisma", () => ({
  default: {
    $queryRaw: vi.fn(),
    outboxEvent: {
      updateMany: vi.fn(),
    },
  },
}));

const mockedPrisma = prisma as unknown as {
  $queryRaw: ReturnType<typeof vi.fn>;
  outboxEvent: {
    updateMany: ReturnType<typeof vi.fn>;
  };
};

describe("PrismaOutboxRelayStore", () => {
  const store = new PrismaOutboxRelayStore();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claims and returns pending outbox events", async () => {
    const rows = [
      {
        id: "outbox-1",
        eventName: "OrderPlaced",
        aggregateId: "order-1",
        payload: { eventName: "OrderPlaced" },
        attempts: 0,
        occurredAt: new Date(),
      },
    ];

    mockedPrisma.$queryRaw.mockResolvedValue(rows);

    const result = await store.claimBatch("worker-1", 50, 10, 60);

    expect(result).toEqual(rows);
    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("returns an empty batch when no events can be claimed", async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([]);

    const result = await store.claimBatch("worker-1", 50, 10, 60);

    expect(result).toEqual([]);
    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("updates only an event claimed by the same owner", async () => {
    mockedPrisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });

    const publishedAt = new Date();

    await store.updateClaimed("outbox-1", "worker-1", {
      publishedAt,
      lockedAt: null,
      lockOwner: null,
      leaseUntil: null,
    });

    expect(mockedPrisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: "outbox-1",
        lockOwner: "worker-1",
      },
      data: {
        publishedAt,
        lockedAt: null,
        lockOwner: null,
        leaseUntil: null,
      },
    });
  });

  it("persists retry and dead-letter state", async () => {
    mockedPrisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });

    const deadLetteredAt = new Date();

    await store.updateClaimed("outbox-1", "worker-1", {
      attempts: { increment: 1 },
      lockedAt: null,
      lockOwner: null,
      leaseUntil: null,
      deadLetteredAt,
      lastError: "bus down",
    });

    expect(mockedPrisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: "outbox-1",
        lockOwner: "worker-1",
      },
      data: {
        attempts: { increment: 1 },
        lockedAt: null,
        lockOwner: null,
        leaseUntil: null,
        deadLetteredAt,
        lastError: "bus down",
      },
    });
  });
});
