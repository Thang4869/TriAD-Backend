import prisma from "@core/database/prisma";
import { Prisma } from "@prisma/client";
import {
  ClaimedOutboxEvent,
  OutboxRelayStore,
  OutboxRelayUpdate,
} from "./outbox-relay-store.port";

export class PrismaOutboxRelayStore implements OutboxRelayStore {
  async claimBatch(
    owner: string,
    batchSize: number,
    maxAttempts: number,
    lockLeaseSeconds: number,
  ): Promise<ClaimedOutboxEvent[]> {
    return prisma.$queryRaw<ClaimedOutboxEvent[]>`
      WITH candidates AS (
        SELECT id
        FROM outbox_events
        WHERE "publishedAt" IS NULL
          AND attempts < ${maxAttempts}
          AND ("leaseUntil" IS NULL OR "leaseUntil" < NOW())
        ORDER BY "occurredAt" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE outbox_events AS events
          SET "lockedAt" = NOW(),
              "lockOwner" = ${owner},
              "leaseUntil" = NOW() + (${lockLeaseSeconds} || ' seconds')::interval
      FROM candidates
      WHERE events.id = candidates.id
      RETURNING
        events.id,
        events."eventName",
        events."aggregateId",
        events.payload,
        events.attempts,
        events."occurredAt"
    `;
  }

  async updateClaimed(
    id: string,
    owner: string,
    data: OutboxRelayUpdate,
  ): Promise<boolean> {
    const result = await prisma.outboxEvent.updateMany({
      where: {
        id,
        lockOwner: owner,
        publishedAt: null,
        deadLetteredAt: null,
        leaseUntil: { gt: new Date() },
      },
      data,
    });
    return result.count === 1;
  }

  async renewClaims(
    owner: string,
    ids: string[],
    lockLeaseSeconds: number,
  ): Promise<string[]> {
    if (ids.length === 0) return [];

    const renewed = await prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE outbox_events
      SET "lockedAt" = NOW(),
          "leaseUntil" = NOW() + (${lockLeaseSeconds} || ' seconds')::interval
      WHERE id IN (${Prisma.join(ids)})
        AND "lockOwner" = ${owner}
        AND "publishedAt" IS NULL
        AND "deadLetteredAt" IS NULL
        AND "leaseUntil" > NOW()
      RETURNING id
    `;
    return renewed.map((row) => row.id);
  }
}
