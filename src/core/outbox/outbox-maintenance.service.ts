import {
  DeadLetterEventRecord,
  OutboxMaintenanceStore,
} from "./outbox-maintenance.port";

export interface ReplayDeadLettersResult {
  events: DeadLetterEventRecord[];
  replayedIds: string[];
}

export interface CleanupPublishedOptions {
  cutoff: Date;
  limit: number;
  dryRun?: boolean;
}

export interface CleanupPublishedResult {
  eligibleCount: number;
  deletedIds: string[];
  dryRun: boolean;
}

export class OutboxMaintenanceService {
  constructor(private readonly store: OutboxMaintenanceStore) {}

  async replayDeadLetters(
    ids: readonly string[],
  ): Promise<ReplayDeadLettersResult> {
    const uniqueIds = normalizeIds(ids);

    if (uniqueIds.length === 0) {
      throw new Error("At least one outbox event id is required");
    }

    const events = await this.store.findDeadLettersByIds(uniqueIds);
    const eligibleIds = new Set(events.map((event) => event.id));

    const ineligibleIds = uniqueIds.filter((id) => !eligibleIds.has(id));

    if (ineligibleIds.length > 0) {
      throw new Error(
        `Outbox events are missing or not dead-lettered: ${ineligibleIds.join(
          ", ",
        )}`,
      );
    }

    const replayedIds = await this.store.requeueDeadLetters(uniqueIds);

    if (replayedIds.length !== uniqueIds.length) {
      throw new Error(
        "Outbox dead-letter selection changed before replay could be committed",
      );
    }

    return {
      events,
      replayedIds,
    };
  }

  async cleanupPublished(
    options: CleanupPublishedOptions,
  ): Promise<CleanupPublishedResult> {
    validateCleanupOptions(options);

    const eligibleCount = await this.store.countPublishedBefore(options.cutoff);
    const dryRun = options.dryRun ?? true;

    if (dryRun || eligibleCount === 0) {
      return {
        eligibleCount,
        deletedIds: [],
        dryRun,
      };
    }

    const deletedIds = await this.store.deletePublishedBefore(
      options.cutoff,
      options.limit,
    );

    return {
      eligibleCount,
      deletedIds,
      dryRun: false,
    };
  }
}

function normalizeIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
}

function validateCleanupOptions(options: CleanupPublishedOptions): void {
  if (Number.isNaN(options.cutoff.getTime())) {
    throw new Error("Cleanup cutoff must be a valid date");
  }

  if (!Number.isSafeInteger(options.limit) || options.limit <= 0) {
    throw new Error("Cleanup limit must be a positive safe integer");
  }
}
