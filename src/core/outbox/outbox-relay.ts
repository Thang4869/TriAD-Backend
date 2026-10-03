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
import { deserializeOutboxEvent } from "./outbox-event-schema";
import { withRetry } from "@core/circuit-breaker/circuit-breaker";
import {
  outboxEventsClaimed,
  outboxEventsPublished,
  outboxEventsFailed,
  outboxEventsDeadLettered,
  outboxLagSeconds,
  outboxDeadLetteredEvents,
} from "@core/metrics/metrics.registry";
import crypto from "crypto";

const POLL_INTERVAL_MS = 2_000;
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 10;
const LOCK_LEASE_SECONDS = 60;

export interface OutboxRelayOptions {
  pollIntervalMs?: number;
  batchSize?: number;
  maxAttempts?: number;
  leaseDurationSeconds?: number;
  heartbeatIntervalMs?: number;
  owner?: string;
}

export class OutboxRelay {
  private inFlightPoll: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatInFlight = false;
  private activeClaimIds = new Set<string>();
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly leaseDurationSeconds: number;
  private readonly heartbeatIntervalMs: number;
  private readonly owner: string;

  constructor(
    private readonly store: OutboxRelayStore,
    private readonly handlerTracker: HandlerExecutionTracker,
    private readonly eventBus: EventBus,
    options: OutboxRelayOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
    this.batchSize = options.batchSize ?? BATCH_SIZE;
    this.maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
    this.leaseDurationSeconds =
      options.leaseDurationSeconds ?? LOCK_LEASE_SECONDS;
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs ??
      Math.max(100, Math.floor((this.leaseDurationSeconds * 1000) / 3));
    this.owner = options.owner ?? crypto.randomUUID();
  }

  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      if (this.inFlightPoll) return;

      this.inFlightPoll = this.pollOnce().finally(() => {
        this.inFlightPoll = null;
      });
    }, this.pollIntervalMs).unref();

    logger.info("OutboxRelay started", { intervalMs: this.pollIntervalMs });
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
        this.batchSize,
        this.maxAttempts,
        this.leaseDurationSeconds,
      );

      await this.refreshObservability();
      outboxEventsClaimed.inc(rows.length);

      this.startHeartbeat(rows.map((row) => row.id));
      try {
        for (const row of rows) {
          if (!this.activeClaimIds.has(row.id)) continue;
          await this.publishRow(row);
        }
      } finally {
        this.stopHeartbeat();
      }
    } catch (error) {
      logger.error("OutboxRelay poll failed", { error });
    } finally {
      this.running = false;
    }
  }

  private async publishRow(row: ClaimedOutboxEvent): Promise<void> {
    try {
      await withRetry(
        async () => {
          const result = await this.eventBus.publish(
            deserializeOutboxEvent(row.payload, {
              eventName: row.eventName,
              aggregateId: row.aggregateId,
            }),
            {
              eventId: row.id,
              tracker: this.handlerTracker,
            },
          );
          if (!result.success) {
            throw new Error(
              `Handlers failed: ${result.failedHandlers.join(", ")}`,
            );
          }
          return result;
        },
        {
          retries: 2,
          minTimeout: 50,
          maxTimeout: 500,
        },
      );
      const updated = await this.updateClaimedRow(row.id, {
        publishedAt: new Date(),
        lockedAt: null,
        lockOwner: null,
        leaseUntil: null,
      });
      if (!updated) return;
      outboxEventsPublished.inc();
    } catch (error) {
      logger.error("OutboxRelay failed to publish event, will retry", {
        error,
        eventName: row.eventName,
        aggregateId: row.aggregateId,
        attempts: row.attempts,
      });
      const attempts = row.attempts + 1;
      const deadLettered = attempts >= this.maxAttempts;
      const updated = await this.updateClaimedRow(row.id, {
        attempts: { increment: 1 },
        lockedAt: null,
        lockOwner: null,
        leaseUntil: deadLettered
          ? null
          : new Date(Date.now() + Math.min(60_000, 1000 * 2 ** row.attempts)),
        deadLetteredAt: deadLettered ? new Date() : null,
        lastError: error instanceof Error ? error.message : String(error),
      });
      if (!updated) return;
      if (deadLettered) outboxEventsDeadLettered.inc();
      outboxEventsFailed.inc();
    }
  }

  private async updateClaimedRow(
    id: string,
    data: OutboxRelayUpdate,
  ): Promise<boolean> {
    const updated = await this.store.updateClaimed(id, this.owner, data);
    this.activeClaimIds.delete(id);
    if (!updated) {
      logger.warn("OutboxRelay lost ownership before updating event", {
        eventId: id,
        owner: this.owner,
      });
    }
    return updated;
  }

  private startHeartbeat(ids: string[]): void {
    if (ids.length === 0) return;
    this.activeClaimIds = new Set(ids);

    this.heartbeatTimer = setInterval(() => {
      if (this.heartbeatInFlight) return;
      const activeIds = [...this.activeClaimIds];
      if (activeIds.length === 0) {
        this.stopHeartbeat();
        return;
      }
      this.heartbeatInFlight = true;
      void this.store
        .renewClaims(this.owner, activeIds, this.leaseDurationSeconds)
        .then((renewed) => {
          const renewedIds = new Set(renewed);
          for (const id of activeIds) {
            if (!renewedIds.has(id)) this.activeClaimIds.delete(id);
          }
          if (renewed.length !== activeIds.length) {
            logger.warn("OutboxRelay lost ownership during heartbeat", {
              owner: this.owner,
              claimed: activeIds.length,
              renewed: renewed.length,
            });
          }
        })
        .catch((error) => {
          logger.warn("OutboxRelay heartbeat failed", { error });
        })
        .finally(() => {
          this.heartbeatInFlight = false;
        });
    }, this.heartbeatIntervalMs).unref();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.activeClaimIds.clear();
  }

  private async refreshObservability(): Promise<void> {
    try {
      const snapshot = await this.store.getObservabilitySnapshot();
      outboxLagSeconds.set(
        snapshot.oldestPendingOccurredAt
          ? Math.max(
              0,
              (Date.now() - snapshot.oldestPendingOccurredAt.getTime()) / 1000,
            )
          : 0,
      );
      outboxDeadLetteredEvents.set(snapshot.deadLetteredCount);
    } catch (error) {
      logger.warn("Outbox observability refresh failed", { error });
    }
  }
}
