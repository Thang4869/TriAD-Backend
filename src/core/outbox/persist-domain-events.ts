import { Prisma } from "@prisma/client";
import { AggregateRoot } from "@shared/domain/aggregate-root";
import type { DomainEvent } from "@shared/domain/events/domain-event";
import { logger } from "@core/logger/winston";

export async function persistEvents(
  tx: Prisma.TransactionClient,
  events: DomainEvent[],
  sourceVersions?: ReadonlyMap<string, number>,
): Promise<void> {
  if (events.length === 0) return;

  try {
    await tx.outboxEvent.createMany({
      data: events.map((event) => ({
        eventName: event.eventName,
        aggregateId: event.aggregateId,
        payload: {
          ...event,
          ...(sourceVersions?.has(event.aggregateId)
            ? { sourceVersion: sourceVersions.get(event.aggregateId) }
            : {}),
        } as Prisma.InputJsonValue,
        occurredAt: event.occurredAt,
      })),
    });
  } catch (error) {
    logger.error(
      "Failed to write domain events to outbox - see prisma/schema.additions.prisma",
      {
        error,
        events: events.map((event) => event.eventName),
      },
    );

    throw error;
  }
}

export async function persistDomainEvents(
  tx: Prisma.TransactionClient,
  aggregates: AggregateRoot[],
  sourceVersions?: ReadonlyMap<string, number>,
): Promise<void> {
  const events = aggregates.flatMap((aggregate) => aggregate.domainEvents);
  await persistEvents(tx, events, sourceVersions);

  if (events.length > 0) {
    for (const aggregate of aggregates) {
      aggregate.pullEvents();
    }
  }
}
