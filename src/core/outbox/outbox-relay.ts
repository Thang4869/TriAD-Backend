import {
  ClaimedOutboxEvent,
  OutboxRelayStore,
  OutboxRelayUpdate,
} from "./outbox-relay-store.port";
import { logger } from "@core/logger/winston";
import {
  EventBus,
  HandlerExecutionTracker,
} from "@shared/domain/event-bus/event-bus";
import { DomainEvent } from "@shared/domain/events/domain-event";
import { withRetry } from "@core/circuit-breaker/circuit-breaker";
import {
  outboxEventsClaimed,
  outboxEventsPublished,
  outboxEventsFailed,
  outboxEventsDeadLettered,
  outboxLagSeconds,
} from "@core/metrics/metrics.registry";
import crypto from "crypto";

const POLL_INTERVAL_MS = 2_000;
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 10;
const LOCK_LEASE_SECONDS = 60;

export class OutboxRelay {
  private inFlightPoll: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly owner = crypto.randomUUID();

  constructor(
    private readonly store: OutboxRelayStore,
    private readonly handlerTracker: HandlerExecutionTracker,
    private readonly eventBus: EventBus,
  ) {}

  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      if (this.inFlightPoll) return;

      this.inFlightPoll = this.pollOnce().finally(() => {
        this.inFlightPoll = null;
      });
    }, POLL_INTERVAL_MS).unref();

    logger.info("OutboxRelay started", { intervalMs: POLL_INTERVAL_MS });
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.inFlightPoll) {
      await this.inFlightPoll;
    }

    logger.info("OutboxRelay stopped");
  }

  async pollOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.store.claimBatch(
        this.owner,
        BATCH_SIZE,
        MAX_ATTEMPTS,
        LOCK_LEASE_SECONDS,
      );

      outboxEventsClaimed.inc(rows.length);
      const occurredAt = rows[0]?.occurredAt;
      outboxLagSeconds.set(
        occurredAt
          ? Math.max(0, (Date.now() - new Date(occurredAt).getTime()) / 1000)
          : 0,
      );

      for (const row of rows) {
        await this.publishRow(row);
      }
    } catch (error) {
      logger.error("OutboxRelay poll failed", { error });
    } finally {
      this.running = false;
    }
  }

  private async publishRow(row: ClaimedOutboxEvent): Promise<void> {
    try {
      const result = await withRetry(
        () =>
          this.eventBus.publish(deserializeDomainEvent(row.payload), {
            eventId: row.id,
            tracker: this.handlerTracker,
          }),
        {
          retries: 2,
          minTimeout: 50,
          maxTimeout: 500,
        },
      );
      if (!result.success) {
        throw new Error(`Handlers failed: ${result.failedHandlers.join(", ")}`);
      }
      await this.updateClaimedRow(row.id, {
        publishedAt: new Date(),
        lockedAt: null,
        lockOwner: null,
        leaseUntil: null,
      });
      outboxEventsPublished.inc();
    } catch (error) {
      logger.error("OutboxRelay failed to publish event, will retry", {
        error,
        eventName: row.eventName,
        aggregateId: row.aggregateId,
        attempts: row.attempts,
      });
      const attempts = row.attempts + 1;
      const deadLettered = attempts >= MAX_ATTEMPTS;
      await this.updateClaimedRow(row.id, {
        attempts: { increment: 1 },
        lockedAt: null,
        lockOwner: null,
        leaseUntil: deadLettered
          ? null
          : new Date(Date.now() + Math.min(60_000, 1000 * 2 ** row.attempts)),
        deadLetteredAt: deadLettered ? new Date() : null,
        lastError: error instanceof Error ? error.message : String(error),
      });
      if (deadLettered) outboxEventsDeadLettered.inc();
      outboxEventsFailed.inc();
    }
  }

  private async updateClaimedRow(
    id: string,
    data: OutboxRelayUpdate,
  ): Promise<void> {
    await this.store.updateClaimed(id, this.owner, data);
  }
}

function deserializeDomainEvent(payload: unknown): DomainEvent {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid outbox event payload");
  }
  const event = payload as DomainEvent;
  return {
    ...event,
    occurredAt: new Date(event.occurredAt),
  };
}
