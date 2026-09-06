import { AsyncLocalStorage } from "async_hooks";
import prisma from "@core/database/prisma";
import { Prisma } from "@prisma/client";
import { AggregateRoot } from "@shared/domain/aggregate-root";
import { logger } from "@core/logger/winston";

export type TxClient = Prisma.TransactionClient;

interface UnitOfWorkContext {
  tx: TxClient;
}

const storage = new AsyncLocalStorage<UnitOfWorkContext>();

export async function persistDomainEvents(
  tx: TxClient,
  aggregates: AggregateRoot[],
): Promise<void> {
  const events = aggregates.flatMap((a) => a.pullEvents());
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
  } catch (error) {
    logger.error(
      "Failed to write domain events to outbox - see prisma/schema.additions.prisma",
      { error, events: events.map((e) => e.eventName) },
    );
    throw error;
  }
}

export class UnitOfWork {
  static async run<T>(
    fn: (tx: TxClient) => Promise<T>,
    options?: {
      aggregates?: (result: T) => AggregateRoot[];
      isolationLevel?: Prisma.TransactionIsolationLevel;
      timeout?: number;
    },
  ): Promise<T> {
    return prisma.$transaction(
      async (tx) => {
        const result = await storage.run({ tx }, () => fn(tx));
        const aggregates = options?.aggregates?.(result) ?? [];
        await persistDomainEvents(tx, aggregates);
        return result;
      },
      {
        isolationLevel: options?.isolationLevel,
        timeout: options?.timeout ?? 10_000,
      },
    );
  }

  static get current(): TxClient | undefined {
    return storage.getStore()?.tx;
  }
}

export abstract class RepositoryBase {
  protected get tx(): TxClient {
    const client = UnitOfWork.current;
    if (!client) {
      throw new Error(
        "No active transaction. Call this method from within UnitOfWork.run(...)",
      );
    }
    return client;
  }

  protected get db(): TxClient | typeof prisma {
    return UnitOfWork.current ?? prisma;
  }
}
