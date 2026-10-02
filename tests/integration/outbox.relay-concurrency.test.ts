import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { EventBus } from "@shared/domain/event-bus/event-bus";
import type { DomainEvent } from "@shared/domain/events/domain-event";
import { OutboxRelay } from "@core/outbox/outbox-relay";
import { PrismaOutboxRelayStore } from "@core/outbox/prisma-outbox-relay.store";
import { writeProductCatalogProjection } from "@core/outbox/projection-writer";
import prisma from "@core/database/prisma";

const tracker = {
  hasSucceeded: async () => false,
  recordResult: async () => undefined,
};

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function event(
  id: string,
  aggregateId: string,
  sourceVersion: number,
  occurredAt: Date,
) {
  return {
    id,
    eventName: "RelayConcurrencyTest",
    aggregateId,
    payload: {
      eventName: "RelayConcurrencyTest",
      aggregateId,
      occurredAt: occurredAt.toISOString(),
      sourceVersion,
      productId: aggregateId,
    },
    occurredAt,
  };
}

function projectionSnapshot(
  productId: string,
  sourceVersion: number,
  name: string,
) {
  return {
    productId,
    name,
    description: name,
    price: sourceVersion * 10,
    stock: sourceVersion,
    category: "relay-test",
    images: [],
    slug: `${productId}-slug`,
    isActive: true,
    avgRating: 0,
    reviewCount: 0,
    searchText: name,
    sourceVersion,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  } as Prisma.ProductCatalogProjectionUncheckedCreateInput;
}

function createRelay(
  store: PrismaOutboxRelayStore,
  eventBus: EventBus,
  options: ConstructorParameters<typeof OutboxRelay>[3] = {},
) {
  return new OutboxRelay(store, tracker, eventBus, options);
}

describe("outbox relay concurrency (integration, real DB)", () => {
  it("allows same-aggregate completion out of order while projection CAS converges", async () => {
    const aggregateId = `relay-same-${Date.now()}`;
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const completionOrder: number[] = [];
    const occurredAt = new Date();

    await prisma.outboxEvent.createMany({
      data: [
        event(`${aggregateId}-1`, aggregateId, 1, occurredAt),
        event(
          `${aggregateId}-2`,
          aggregateId,
          2,
          new Date(occurredAt.getTime() + 10_000),
        ),
      ],
    });

    const handler = async (payload: DomainEvent) => {
      const sourceVersion = payload.sourceVersion!;
      if (sourceVersion === 1) {
        firstStarted.resolve();
        await releaseFirst.promise;
      }
      await writeProductCatalogProjection(
        prisma,
        projectionSnapshot(aggregateId, sourceVersion, `v${sourceVersion}`),
      );
      completionOrder.push(sourceVersion);
    };
    const createBus = () => {
      const bus = new EventBus();
      bus.subscribe("RelayConcurrencyTest", "controlled-projection", handler);
      return bus;
    };
    const relayA = createRelay(new PrismaOutboxRelayStore(), createBus(), {
      batchSize: 1,
      leaseDurationSeconds: 5,
      heartbeatIntervalMs: 500,
    });
    const relayB = createRelay(new PrismaOutboxRelayStore(), createBus(), {
      batchSize: 1,
      leaseDurationSeconds: 5,
      heartbeatIntervalMs: 500,
    });

    const firstPoll = relayA.pollOnce();
    await firstStarted.promise;
    const secondPoll = relayB.pollOnce();
    await secondPoll;

    const claimed = await prisma.outboxEvent.findMany({
      where: { aggregateId },
      orderBy: { id: "asc" },
      select: { id: true, lockOwner: true, publishedAt: true },
    });
    expect(new Set(claimed.map((row) => row.lockOwner)).size).toBe(2);
    expect(completionOrder).toEqual([2]);

    releaseFirst.resolve();
    await firstPoll;

    expect(completionOrder).toEqual([2, 1]);
    await expect(
      prisma.productCatalogProjection.findUnique({
        where: { productId: aggregateId },
      }),
    ).resolves.toMatchObject({ sourceVersion: 2, name: "v2" });
  });

  it("keeps different aggregates concurrently claimable", async () => {
    const firstStarted = deferred();
    const secondStarted = deferred();
    const releaseHandlers = deferred();
    const aggregateA = `relay-a-${Date.now()}`;
    const aggregateB = `relay-b-${Date.now()}`;
    const occurredAt = new Date();

    await prisma.outboxEvent.createMany({
      data: [
        event(`${aggregateA}-1`, aggregateA, 1, occurredAt),
        event(
          `${aggregateB}-1`,
          aggregateB,
          1,
          new Date(occurredAt.getTime() + 10_000),
        ),
      ],
    });

    const handler = async (payload: { aggregateId: string }) => {
      if (payload.aggregateId === aggregateA) firstStarted.resolve();
      else secondStarted.resolve();
      await releaseHandlers.promise;
    };
    const createBus = () => {
      const bus = new EventBus();
      bus.subscribe("RelayConcurrencyTest", "controlled-handler", handler);
      return bus;
    };
    const relayA = createRelay(new PrismaOutboxRelayStore(), createBus(), {
      batchSize: 1,
    });
    const relayB = createRelay(new PrismaOutboxRelayStore(), createBus(), {
      batchSize: 1,
    });

    const firstPoll = relayA.pollOnce();
    await firstStarted.promise;
    const secondPoll = relayB.pollOnce();
    await secondStarted.promise;

    releaseHandlers.resolve();
    await Promise.all([firstPoll, secondPoll]);
  });

  it("renews active batch claims and prevents a second relay from stealing them", async () => {
    const aggregateId = `relay-heartbeat-${Date.now()}`;
    const started = deferred();
    const release = deferred();
    await prisma.outboxEvent.createMany({
      data: [
        event(`${aggregateId}-1`, aggregateId, 1, new Date()),
        event(`${aggregateId}-2`, aggregateId, 2, new Date(Date.now() + 1)),
      ],
    });

    const slowBus = new EventBus();
    slowBus.subscribe("RelayConcurrencyTest", "slow-handler", async () => {
      started.resolve();
      await release.promise;
    });
    const relayA = createRelay(new PrismaOutboxRelayStore(), slowBus, {
      batchSize: 2,
      leaseDurationSeconds: 1,
      heartbeatIntervalMs: 200,
    });
    const relayB = createRelay(new PrismaOutboxRelayStore(), new EventBus(), {
      batchSize: 2,
      leaseDurationSeconds: 1,
    });

    const firstPoll = relayA.pollOnce();
    await started.promise;
    await sleep(1_300);
    await relayB.pollOnce();
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId, lockOwner: { not: null }, publishedAt: null },
      }),
    ).toBe(2);

    release.resolve();
    await firstPoll;
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId, publishedAt: { not: null } },
      }),
    ).toBe(2);
  });

  it("reclaims an abandoned lease and rejects stale-owner writes", async () => {
    const aggregateId = `relay-reclaim-${Date.now()}`;
    const started = deferred();
    const releaseStale = deferred();
    await prisma.outboxEvent.create({
      data: event(`${aggregateId}-1`, aggregateId, 1, new Date()),
    });

    const staleBus = new EventBus();
    staleBus.subscribe("RelayConcurrencyTest", "stale-handler", async () => {
      started.resolve();
      await releaseStale.promise;
    });
    const staleRelay = createRelay(new PrismaOutboxRelayStore(), staleBus, {
      leaseDurationSeconds: 1,
      heartbeatIntervalMs: 10_000,
    });
    const replacementBus = new EventBus();
    replacementBus.subscribe(
      "RelayConcurrencyTest",
      "replacement-handler",
      async () => undefined,
    );
    const replacementRelay = createRelay(
      new PrismaOutboxRelayStore(),
      replacementBus,
      { leaseDurationSeconds: 1 },
    );

    const stalePoll = staleRelay.pollOnce();
    await started.promise;
    await sleep(1_300);
    await replacementRelay.pollOnce();
    releaseStale.resolve();
    await stalePoll;

    await expect(
      prisma.outboxEvent.findUnique({ where: { id: `${aggregateId}-1` } }),
    ).resolves.toMatchObject({
      publishedAt: expect.any(Date),
      lockOwner: null,
    });
  });
});
