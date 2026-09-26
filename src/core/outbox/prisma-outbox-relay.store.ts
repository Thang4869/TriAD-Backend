import prisma from "@core/database/prisma";
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
  ): Promise<void> {
    await prisma.outboxEvent.updateMany({
      where: {
        id,
        lockOwner: owner,
      },
      data,
    });
  }
}
