import prisma from "@core/database/prisma";
import { logger } from "@core/logger/winston";
import { EventBus } from "@shared/domain/event-bus/event-bus";
import { DomainEvent } from "@shared/domain/events/domain-event";
import { withRetry } from "@core/circuit-breaker/circuit-breaker";

const POLL_INTERVAL_MS = 2_000;
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 10;

export class OutboxRelay {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly eventBus: EventBus = EventBus.getInstance()) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, POLL_INTERVAL_MS).unref();
    logger.info("OutboxRelay started", { intervalMs: POLL_INTERVAL_MS });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async pollOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await prisma.$queryRaw<
        Array<{
          id: string;
          eventName: string;
          aggregateId: string;
          payload: unknown;
          attempts: number;
        }>
      >`
        SELECT id, "eventName", "aggregateId", payload, attempts
        FROM outbox_events
        WHERE "publishedAt" IS NULL AND attempts < ${MAX_ATTEMPTS}
        ORDER BY "occurredAt" ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;

      for (const row of rows) {
        await this.publishRow(row);
      }
    } catch (error) {
      logger.error("OutboxRelay poll failed", { error });
    } finally {
      this.running = false;
    }
  }

  private async publishRow(row: {
    id: string;
    eventName: string;
    aggregateId: string;
    payload: unknown;
    attempts: number;
  }): Promise<void> {
    try {
      await withRetry(() => this.eventBus.publish(row.payload as DomainEvent), {
        retries: 2,
        minTimeout: 50,
        maxTimeout: 500,
      });
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: { publishedAt: new Date() },
      });
    } catch (error) {
      logger.error("OutboxRelay failed to publish event, will retry", {
        error,
        eventName: row.eventName,
        aggregateId: row.aggregateId,
        attempts: row.attempts,
      });
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
    }
  }
}

export const outboxRelay = new OutboxRelay();
