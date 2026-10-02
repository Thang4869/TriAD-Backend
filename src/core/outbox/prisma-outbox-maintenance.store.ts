import prisma from "@core/database/prisma";
import { Prisma } from "@prisma/client";
import {
  DeadLetterEventRecord,
  OutboxMaintenanceStore,
} from "./outbox-maintenance.port";

export class PrismaOutboxMaintenanceStore implements OutboxMaintenanceStore {
  async findDeadLettersByIds(
    ids: readonly string[],
  ): Promise<DeadLetterEventRecord[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];

    const rows = await prisma.outboxEvent.findMany({
      where: {
        id: { in: uniqueIds },
        publishedAt: null,
        deadLetteredAt: { not: null },
      },
      select: {
        id: true,
        eventName: true,
        aggregateId: true,
        attempts: true,
        occurredAt: true,
        deadLetteredAt: true,
        lastError: true,
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });

    return rows.flatMap((row) =>
      row.deadLetteredAt
        ? [
            {
              id: row.id,
              eventName: row.eventName,
              aggregateId: row.aggregateId,
              attempts: row.attempts,
              occurredAt: row.occurredAt,
              deadLetteredAt: row.deadLetteredAt,
              lastError: row.lastError,
            },
          ]
        : [],
    );
  }

  async requeueDeadLetters(ids: readonly string[]): Promise<string[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];

    return prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM outbox_events
        WHERE id IN (${Prisma.join(uniqueIds)})
          AND "publishedAt" IS NULL
          AND "deadLetteredAt" IS NOT NULL
        FOR UPDATE
      `;

      if (lockedRows.length !== uniqueIds.length) {
        return [];
      }

      const updated = await tx.outboxEvent.updateMany({
        where: {
          id: { in: uniqueIds },
          publishedAt: null,
          deadLetteredAt: { not: null },
        },
        data: {
          attempts: 0,
          deadLetteredAt: null,
          lastError: null,
          lockedAt: null,
          lockOwner: null,
          leaseUntil: null,
        },
      });

      if (updated.count !== uniqueIds.length) {
        throw new Error(
          "Outbox dead-letter replay selection changed while requeueing",
        );
      }

      return uniqueIds;
    });
  }

  async countPublishedBefore(cutoff: Date): Promise<number> {
    return prisma.outboxEvent.count({
      where: {
        publishedAt: {
          not: null,
          lt: cutoff,
        },
      },
    });
  }

  async deletePublishedBefore(cutoff: Date, limit: number): Promise<string[]> {
    if (limit <= 0) return [];

    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      WITH candidates AS (
        SELECT id
        FROM outbox_events
        WHERE "publishedAt" IS NOT NULL
          AND "publishedAt" < ${cutoff}
        ORDER BY "publishedAt" ASC, id ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM outbox_events AS events
      USING candidates
      WHERE events.id = candidates.id
      RETURNING events.id
    `;

    return rows.map((row) => row.id);
  }
}
