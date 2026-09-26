export interface ClaimedOutboxEvent {
  id: string;
  eventName: string;
  aggregateId: string;
  payload: unknown;
  attempts: number;
  occurredAt?: Date;
}

export interface OutboxRelayUpdate {
  publishedAt?: Date;
  attempts?: { increment: number };
  lockedAt?: Date | null;
  lockOwner?: string | null;
  leaseUntil?: Date | null;
  deadLetteredAt?: Date | null;
  lastError?: string;
}

export interface OutboxRelayStore {
  claimBatch(
    owner: string,
    batchSize: number,
    maxAttempts: number,
    lockLeaseSeconds: number,
  ): Promise<ClaimedOutboxEvent[]>;

  updateClaimed(
    id: string,
    owner: string,
    data: OutboxRelayUpdate,
  ): Promise<void>;
}
