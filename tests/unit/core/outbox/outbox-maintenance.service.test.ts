import { describe, expect, it, vi } from "vitest";
import {
  DeadLetterEventRecord,
  OutboxMaintenanceStore,
} from "@core/outbox/outbox-maintenance.port";
import { OutboxMaintenanceService } from "@core/outbox/outbox-maintenance.service";

function createStore(
  overrides: Partial<OutboxMaintenanceStore> = {},
): OutboxMaintenanceStore {
  return {
    findDeadLettersByIds: vi.fn().mockResolvedValue([]),
    requeueDeadLetters: vi.fn().mockResolvedValue([]),
    countPublishedBefore: vi.fn().mockResolvedValue(0),
    deletePublishedBefore: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function deadLetter(id: string): DeadLetterEventRecord {
  return {
    id,
    eventName: "OrderPlaced",
    aggregateId: `order-${id}`,
    attempts: 10,
    occurredAt: new Date("2026-10-01T00:00:00.000Z"),
    deadLetteredAt: new Date("2026-10-02T00:00:00.000Z"),
    lastError: "handler failed",
  };
}

describe("OutboxMaintenanceService", () => {
  describe("replayDeadLetters", () => {
    it("normalizes duplicate ids and requeues the complete eligible selection", async () => {
      const events = [deadLetter("event-1"), deadLetter("event-2")];

      const store = createStore({
        findDeadLettersByIds: vi.fn().mockResolvedValue(events),
        requeueDeadLetters: vi.fn().mockResolvedValue(["event-1", "event-2"]),
      });

      const service = new OutboxMaintenanceService(store);

      await expect(
        service.replayDeadLetters([" event-1 ", "event-2", "event-1", ""]),
      ).resolves.toEqual({
        events,
        replayedIds: ["event-1", "event-2"],
      });

      expect(store.findDeadLettersByIds).toHaveBeenCalledWith([
        "event-1",
        "event-2",
      ]);

      expect(store.requeueDeadLetters).toHaveBeenCalledWith([
        "event-1",
        "event-2",
      ]);
    });

    it("rejects an empty replay request", async () => {
      const store = createStore();
      const service = new OutboxMaintenanceService(store);

      await expect(service.replayDeadLetters(["", "   "])).rejects.toThrow(
        "At least one outbox event id is required",
      );

      expect(store.findDeadLettersByIds).not.toHaveBeenCalled();
      expect(store.requeueDeadLetters).not.toHaveBeenCalled();
    });

    it("rejects the whole replay when any requested event is ineligible", async () => {
      const store = createStore({
        findDeadLettersByIds: vi
          .fn()
          .mockResolvedValue([deadLetter("event-1")]),
      });

      const service = new OutboxMaintenanceService(store);

      await expect(
        service.replayDeadLetters(["event-1", "event-2"]),
      ).rejects.toThrow(
        "Outbox events are missing or not dead-lettered: event-2",
      );

      expect(store.requeueDeadLetters).not.toHaveBeenCalled();
    });

    it("fails when the selection changes before the atomic requeue commits", async () => {
      const store = createStore({
        findDeadLettersByIds: vi
          .fn()
          .mockResolvedValue([deadLetter("event-1"), deadLetter("event-2")]),
        requeueDeadLetters: vi.fn().mockResolvedValue([]),
      });

      const service = new OutboxMaintenanceService(store);

      await expect(
        service.replayDeadLetters(["event-1", "event-2"]),
      ).rejects.toThrow(
        "Outbox dead-letter selection changed before replay could be committed",
      );
    });
  });

  describe("cleanupPublished", () => {
    it("performs a dry run by default without deleting rows", async () => {
      const store = createStore({
        countPublishedBefore: vi.fn().mockResolvedValue(12),
      });

      const service = new OutboxMaintenanceService(store);
      const cutoff = new Date("2026-09-01T00:00:00.000Z");

      await expect(
        service.cleanupPublished({
          cutoff,
          limit: 500,
        }),
      ).resolves.toEqual({
        eligibleCount: 12,
        deletedIds: [],
        dryRun: true,
      });

      expect(store.countPublishedBefore).toHaveBeenCalledWith(cutoff);
      expect(store.deletePublishedBefore).not.toHaveBeenCalled();
    });

    it("deletes only up to the requested limit when execution is enabled", async () => {
      const store = createStore({
        countPublishedBefore: vi.fn().mockResolvedValue(10),
        deletePublishedBefore: vi
          .fn()
          .mockResolvedValue(["event-1", "event-2"]),
      });

      const service = new OutboxMaintenanceService(store);
      const cutoff = new Date("2026-09-01T00:00:00.000Z");

      await expect(
        service.cleanupPublished({
          cutoff,
          limit: 2,
          dryRun: false,
        }),
      ).resolves.toEqual({
        eligibleCount: 10,
        deletedIds: ["event-1", "event-2"],
        dryRun: false,
      });

      expect(store.deletePublishedBefore).toHaveBeenCalledWith(cutoff, 2);
    });

    it("does not issue a delete when no published events are eligible", async () => {
      const store = createStore({
        countPublishedBefore: vi.fn().mockResolvedValue(0),
      });

      const service = new OutboxMaintenanceService(store);

      await expect(
        service.cleanupPublished({
          cutoff: new Date("2026-09-01T00:00:00.000Z"),
          limit: 500,
          dryRun: false,
        }),
      ).resolves.toEqual({
        eligibleCount: 0,
        deletedIds: [],
        dryRun: false,
      });

      expect(store.deletePublishedBefore).not.toHaveBeenCalled();
    });

    it("rejects an invalid cutoff", async () => {
      const store = createStore();
      const service = new OutboxMaintenanceService(store);

      await expect(
        service.cleanupPublished({
          cutoff: new Date("invalid"),
          limit: 500,
        }),
      ).rejects.toThrow("Cleanup cutoff must be a valid date");
    });

    it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
      "rejects invalid cleanup limit %s",
      async (limit) => {
        const store = createStore();
        const service = new OutboxMaintenanceService(store);

        await expect(
          service.cleanupPublished({
            cutoff: new Date("2026-09-01T00:00:00.000Z"),
            limit,
          }),
        ).rejects.toThrow("Cleanup limit must be a positive safe integer");
      },
    );
  });
});
