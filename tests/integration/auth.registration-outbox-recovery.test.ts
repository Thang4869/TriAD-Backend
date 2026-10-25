import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import prisma from "@core/database/prisma";
import { EventBus } from "@shared/domain/event-bus/event-bus";
import { OutboxRelay } from "@core/outbox/outbox-relay";
import { PrismaOutboxRelayStore } from "@core/outbox/prisma-outbox-relay.store";
import { PrismaOutboxHandlerTracker } from "@core/outbox/outbox-handler-tracker";
import { OutboxMaintenanceService } from "@core/outbox/outbox-maintenance.service";
import { PrismaOutboxMaintenanceStore } from "@core/outbox/prisma-outbox-maintenance.store";
import { RegistrationVerificationHandler } from "@modules/auth/event-handlers/registration-verification.handler";
import { PrismaAuthRepository } from "@modules/auth/infrastructure/repositories/prisma-auth.repository";
import type { ClaimedOutboxEvent } from "@core/outbox/outbox-relay-store.port";
import type { TokenStorePort } from "@modules/auth/application/ports/token-store.port";
import type { EmailService } from "@shared/services/email.service";

/**
 * The real relay store is shared by the whole test database. Isolate its
 * claim step to this test's event, while keeping PostgreSQL lease writes,
 * the actual relay, and the durable Prisma handler tracker.
 */
class RegistrationOnlyStore extends PrismaOutboxRelayStore {
  constructor(private readonly eventId: string) {
    super();
  }

  override async claimBatch(
    owner: string,
    _batchSize: number,
    maxAttempts: number,
    leaseDurationSeconds: number,
  ): Promise<ClaimedOutboxEvent[]> {
    const now = new Date();
    const updated = await prisma.outboxEvent.updateMany({
      where: {
        id: this.eventId,
        publishedAt: null,
        deadLetteredAt: null,
        attempts: { lt: maxAttempts },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: {
        lockOwner: owner,
        lockedAt: now,
        leaseUntil: new Date(now.getTime() + leaseDurationSeconds * 1000),
      },
    });
    if (updated.count === 0) return [];

    const row = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: this.eventId },
    });
    return [
      {
        id: row.id,
        eventName: row.eventName,
        aggregateId: row.aggregateId,
        payload: row.payload,
        attempts: row.attempts,
        occurredAt: row.occurredAt,
      },
    ];
  }
}

const repository = new PrismaAuthRepository();
const handlerName = "RegistrationVerificationHandler";

async function newRegistration() {
  const user = await repository.createUser({
    email: `recovery-${randomUUID()}@example.com`,
    firstName: "Recovery",
    lastName: "Test",
    password: "test-hash",
  });
  const event = await prisma.outboxEvent.findFirstOrThrow({
    where: { aggregateId: user.id, eventName: "UserRegistered" },
  });
  return { user, event };
}

function setup(eventId: string) {
  const tokenStore = {
    set: vi.fn().mockResolvedValue(undefined),
  } as unknown as TokenStorePort;
  const emailService = {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  } as unknown as EmailService;
  const handler = new RegistrationVerificationHandler(
    repository,
    tokenStore,
    emailService,
  );
  const bus = new EventBus();
  bus.subscribe("UserRegistered", handlerName, handler.handle.bind(handler));
  const tracker = new PrismaOutboxHandlerTracker();
  const relay = (owner: string) =>
    new OutboxRelay(new RegistrationOnlyStore(eventId), tracker, bus, {
      owner,
      batchSize: 1,
      leaseDurationSeconds: 30,
      heartbeatIntervalMs: 1000,
    });
  return { tokenStore, emailService, relay };
}

async function rowState(id: string) {
  return prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
}

async function trackedStatus(id: string) {
  const record = await prisma.outboxHandlerLog.findUnique({
    where: {
      outboxEventId_handlerName: {
        outboxEventId: id,
        handlerName,
      },
    },
  });
  return record?.status;
}

describe("registration outbox recovery (real PostgreSQL)", () => {
  it("reclaims a crashed relay lease without losing the verification intent", async () => {
    const { user, event } = await newRegistration();
    const { tokenStore, emailService, relay } = setup(event.id);

    // A process died after claiming, before running the handler.
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        lockOwner: "dead-process",
        lockedAt: new Date(Date.now() - 70_000),
        leaseUntil: new Date(Date.now() - 60_000),
      },
    });

    await relay("replacement-process").pollOnce();

    expect(await rowState(event.id)).toMatchObject({
      publishedAt: expect.any(Date),
      lockOwner: null,
      deadLetteredAt: null,
    });
    expect(await trackedStatus(event.id)).toBe("SUCCESS");
    expect(tokenStore.set).toHaveBeenCalledTimes(1);
    expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
      { email: user.email, firstName: user.firstName },
      expect.stringContaining("/verify-email?token="),
      `registration-verification-${user.id}`,
    );

    // Published events cannot be claimed a second time.
    await relay("another-process").pollOnce();
    expect(emailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("records an outage, then replays the same intent once Redis recovers", async () => {
    const { user, event } = await newRegistration();
    const { tokenStore, emailService, relay } = setup(event.id);
    vi.mocked(tokenStore.set).mockRejectedValue(new Error("Redis outage"));

    await relay("first-process").pollOnce();

    expect(await rowState(event.id)).toMatchObject({
      attempts: 1,
      publishedAt: null,
      deadLetteredAt: null,
    });
    expect(await trackedStatus(event.id)).toBe("FAILED");
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();

    // Move the real persisted backoff deadline into the past, simulating
    // passage of time without a flaky wall-clock sleep.
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { leaseUntil: new Date(Date.now() - 1000) },
    });
    vi.mocked(tokenStore.set).mockResolvedValue(undefined);

    await relay("restart-process").pollOnce();

    expect(await rowState(event.id)).toMatchObject({
      attempts: 1,
      publishedAt: expect.any(Date),
      deadLetteredAt: null,
    });
    expect(await trackedStatus(event.id)).toBe("SUCCESS");
    expect(emailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
      { email: user.email, firstName: user.firstName },
      expect.stringContaining("/verify-email?token="),
      `registration-verification-${user.id}`,
    );
  });

  it("reuses the verification token and job identity after a BullMQ outage", async () => {
    const { user, event } = await newRegistration();
    const { tokenStore, emailService, relay } = setup(event.id);
    vi.mocked(emailService.sendVerificationEmail).mockRejectedValue(
      new Error("BullMQ outage"),
    );

    await relay("queue-disconnected").pollOnce();

    expect(await rowState(event.id)).toMatchObject({
      attempts: 1,
      publishedAt: null,
    });
    expect(await trackedStatus(event.id)).toBe("FAILED");

    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { leaseUntil: new Date(Date.now() - 1000) },
    });
    vi.mocked(emailService.sendVerificationEmail).mockResolvedValue(undefined);

    await relay("queue-recovered").pollOnce();

    expect(await rowState(event.id)).toMatchObject({
      attempts: 1,
      publishedAt: expect.any(Date),
    });
    expect(await trackedStatus(event.id)).toBe("SUCCESS");
    expect(tokenStore.set).toHaveBeenCalled();
    const calls = vi.mocked(tokenStore.set).mock.calls;
    expect(new Set(calls.map((args) => args[0])).size).toBe(1);

    const jobs = vi.mocked(emailService.sendVerificationEmail).mock.calls;
    expect(jobs.length).toBeGreaterThanOrEqual(2);
    expect(new Set(jobs.map((args) => args[2]))).toEqual(
      new Set([`registration-verification-${user.id}`]),
    );
    expect(new Set(jobs.map((args) => args[1])).size).toBe(1);
  });
  it("replays a dead-lettered verification event after an explicit operator action", async () => {
    const { user, event } = await newRegistration();
    const { emailService, relay } = setup(event.id);
    vi.mocked(emailService.sendVerificationEmail).mockRejectedValue(
      new Error("SMTP queue unavailable"),
    );
    // An event has exhausted nine previous durable attempts.
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { attempts: 9 },
    });

    await relay("final-attempt").pollOnce();
    expect(await rowState(event.id)).toMatchObject({
      publishedAt: null,
      attempts: 10,
      deadLetteredAt: expect.any(Date),
    });
    expect(await trackedStatus(event.id)).toBe("FAILED");
    await relay("no-automatic-retry").pollOnce();
    expect((await rowState(event.id)).attempts).toBe(10);

    const service = new OutboxMaintenanceService(
      new PrismaOutboxMaintenanceStore(),
    );
    const replay = await service.replayDeadLetters([event.id]);
    expect(replay.replayedIds).toEqual([event.id]);
    expect(await rowState(event.id)).toMatchObject({
      attempts: 0,
      deadLetteredAt: null,
      lastError: null,
    });

    vi.mocked(emailService.sendVerificationEmail).mockResolvedValue(undefined);
    await relay("operator-replay").pollOnce();
    expect(await rowState(event.id)).toMatchObject({
      attempts: 0,
      publishedAt: expect.any(Date),
      deadLetteredAt: null,
    });
    expect(await trackedStatus(event.id)).toBe("SUCCESS");
    expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
      { email: user.email, firstName: user.firstName },
      expect.stringContaining("/verify-email?token="),
      "registration-verification-" + user.id,
    );
  });
});
