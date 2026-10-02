export interface DeadLetterEventRecord {
  id: string;
  eventName: string;
  aggregateId: string;
  attempts: number;
  occurredAt: Date;
  deadLetteredAt: Date;
  lastError: string | null;
}

export interface OutboxMaintenanceStore {
  /**
   * Returns only unpublished events that are currently dead-lettered.
   */
  findDeadLettersByIds(
    ids: readonly string[],
  ): Promise<DeadLetterEventRecord[]>;

  /**
   * Requeues the complete selection atomically.
   *
   * The original outbox event ids, payloads and handler logs must be preserved
   * so successful handlers remain idempotently skipped during replay.
   *
   * Returns an empty array when the complete requested selection is no longer
   * eligible for replay. Implementations must never partially requeue it.
   */
  requeueDeadLetters(ids: readonly string[]): Promise<string[]>;

  /**
   * Counts already-published events older than the retention cutoff.
   */
  countPublishedBefore(cutoff: Date): Promise<number>;

  /**
   * Deletes at most `limit` already-published events older than `cutoff`.
   *
   * Pending, leased and dead-lettered unpublished events must never be deleted.
   * Related handler logs may be removed only through the database cascade of
   * the published event being deleted.
   */
  deletePublishedBefore(cutoff: Date, limit: number): Promise<string[]>;
}
