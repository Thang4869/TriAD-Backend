import { Prisma } from "@prisma/client";
import { AggregateRoot } from "@shared/domain/aggregate-root";
import { logger } from "@core/logger/winston";

export async function persistDomainEvents(
  tx: Prisma.TransactionClient,
  aggregates: AggregateRoot[],
): Promise<void> {
  const events = aggregates.flatMap((aggregate) => aggregate.domainEvents);

  if (events.length === 0) return;

  try {
    await tx.outboxEvent.createMany({
      data: events.map((event) => ({
        eventName: event.eventName,
        aggregateId: event.aggregateId,
        payload: event as unknown as Prisma.InputJsonValue,
        occurredAt: event.occurredAt,
      })),
    });
    for (const aggregate of aggregates) {
      aggregate.pullEvents();
    }
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
