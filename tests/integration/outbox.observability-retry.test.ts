import { describe, expect, it } from "vitest";
import prisma from "@core/database/prisma";
import { OutboxRelay } from "@core/outbox/outbox-relay";
import { PrismaOutboxHandlerTracker } from "@core/outbox/outbox-handler-tracker";
import { PrismaOutboxRelayStore } from "@core/outbox/prisma-outbox-relay.store";
import { EventBus } from "@shared/domain/event-bus/event-bus";

function outboxEvent(
  id: string,
  eventName: string,
  occurredAt: Date,
  state: {
    publishedAt?: Date | null;
    deadLetteredAt?: Date | null;
    leaseUntil?: Date | null;
    attempts?: number;
  } = {},
) {
  return {
    id,
    eventName,
    aggregateId: id,
    payload: {
      eventName,
      aggregateId: id,
      occurredAt: occurredAt.toISOString(),
    },
    occurredAt,
    publishedAt: state.publishedAt ?? null,
    deadLetteredAt: state.deadLetteredAt ?? null,
    leaseUntil: state.leaseUntil ?? null,
    attempts: state.attempts ?? 0,
  };
}

describe("outbox observability and retry (integration, real DB)", () => {
  it("reports active lag and unresolved dead letters independent of claimability", async () => {
    const now = Date.now();
    const publishedAt = new Date(now - 30_000);
    const activeClaimable = new Date(now - 20_000);
    const activeLeased = new Date(now - 40_000);
    const deadLettered = new Date(now - 50_000);

    await prisma.outboxEvent.createMany({
      data: [
        outboxEvent(
          "observability-published",
          "ObservabilityPublished",
          publishedAt,
          {
            publishedAt,
          },
        ),
        outboxEvent(
          "observability-claimable",
          "ObservabilityClaimable",
          activeClaimable,
        ),
        outboxEvent(
          "observability-leased",
          "ObservabilityLeased",
          activeLeased,
          {
            leaseUntil: new Date(now + 60_000),
          },
        ),
        outboxEvent("observability-dead", "ObservabilityDead", deadLettered, {
          deadLetteredAt: new Date(now - 1_000),
          attempts: 10,
        }),
      ],
    });

    const store = new PrismaOutboxRelayStore();
    await expect(store.getObservabilitySnapshot()).resolves.toEqual({
      oldestPendingOccurredAt: activeLeased,
      deadLetteredCount: 1,
    });

    const claimed = await store.claimBatch(
      "observability-worker-1",
      10,
      10,
      60,
    );
    expect(claimed.map((row) => row.id)).toEqual(["observability-claimable"]);
    expect(
      await store.claimBatch("observability-worker-2", 10, 10, 60),
    ).toEqual([]);

    await expect(store.getObservabilitySnapshot()).resolves.toEqual({
      oldestPendingOccurredAt: activeLeased,
      deadLetteredCount: 1,
    });
  });

  it("recovers a transient handler failure without a durable outbox failure", async () => {
    const eventName = "RetryTransientIntegration";
    const eventId = "retry-transient-integration";
    await prisma.outboxEvent.create({
      data: outboxEvent(eventId, eventName, new Date(Date.now() - 1_000)),
    });

    let calls = 0;
    const eventBus = new EventBus();
    eventBus.subscribe(eventName, "TransientHandler", async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary downstream failure");
    });

    await new OutboxRelay(
      new PrismaOutboxRelayStore(),
      new PrismaOutboxHandlerTracker(),
      eventBus,
      { leaseDurationSeconds: 5, heartbeatIntervalMs: 1_000 },
    ).pollOnce();

    await expect(
      prisma.outboxEvent.findUnique({ where: { id: eventId } }),
    ).resolves.toMatchObject({
      publishedAt: expect.any(Date),
      attempts: 0,
      deadLetteredAt: null,
    });
    expect(calls).toBe(2);

    await expect(
      prisma.outboxHandlerLog.findUnique({
        where: {
          outboxEventId_handlerName: {
            outboxEventId: eventId,
            handlerName: "TransientHandler",
          },
        },
      }),
    ).resolves.toMatchObject({ status: "SUCCESS" });
  });

  it("increments durable attempts once after persistent immediate failure", async () => {
    const eventName = "RetryPersistentIntegration";
    const eventId = "retry-persistent-integration";
    await prisma.outboxEvent.create({
      data: outboxEvent(eventId, eventName, new Date(Date.now() - 1_000)),
    });

    let calls = 0;
    const eventBus = new EventBus();
    eventBus.subscribe(eventName, "PersistentHandler", async () => {
      calls += 1;
      throw new Error("persistent downstream failure");
    });

    await new OutboxRelay(
      new PrismaOutboxRelayStore(),
      new PrismaOutboxHandlerTracker(),
      eventBus,
      { leaseDurationSeconds: 5, heartbeatIntervalMs: 1_000 },
    ).pollOnce();

    await expect(
      prisma.outboxEvent.findUnique({ where: { id: eventId } }),
    ).resolves.toMatchObject({
      publishedAt: null,
      attempts: 1,
      deadLetteredAt: null,
      lastError: "Handlers failed: PersistentHandler",
    });
    expect(calls).toBe(3);
  });
});
