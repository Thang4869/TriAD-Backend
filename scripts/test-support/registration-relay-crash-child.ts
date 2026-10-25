import prisma from "@core/database/prisma";
import { EventBus } from "@shared/domain/event-bus/event-bus";
import { OutboxRelay } from "@core/outbox/outbox-relay";
import { PrismaOutboxRelayStore } from "@core/outbox/prisma-outbox-relay.store";
import { PrismaOutboxHandlerTracker } from "@core/outbox/outbox-handler-tracker";
import type { ClaimedOutboxEvent } from "@core/outbox/outbox-relay-store.port";

class ScopedStore extends PrismaOutboxRelayStore {
  constructor(private readonly eventId: string) {
    super();
  }
  override async claimBatch(
    owner: string,
    _limit: number,
    maxAttempts: number,
    leaseSeconds: number,
  ): Promise<ClaimedOutboxEvent[]> {
    const now = new Date();
    const claimed = await prisma.outboxEvent.updateMany({
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
        leaseUntil: new Date(now.getTime() + leaseSeconds * 1000),
      },
    });
    if (claimed.count !== 1) return [];
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
async function run() {
  const eventId = process.argv[2];
  if (!eventId) throw new Error("Missing outbox event ID");
  const row = await prisma.outboxEvent.findUnique({ where: { id: eventId } });
  if (!row) {
    const url = new URL(
      process.env.DATABASE_URL || "postgresql://localhost/missing",
    );
    throw new Error(
      "Child cannot read registration event in schema " +
        url.searchParams.get("schema") +
        " for event " +
        eventId,
    );
  }
  if (row.publishedAt !== null || row.deadLetteredAt !== null) {
    throw new Error("Registration event is not pending before child claim");
  }
  const bus = new EventBus();
  bus.subscribe(
    "UserRegistered",
    "RegistrationVerificationHandler",
    async () => {
      process.stdout.write("A1_HANDLER_STARTED\n");
      setInterval(() => undefined, 1000);
      await new Promise<void>(() => undefined);
    },
  );
  await new OutboxRelay(
    new ScopedStore(eventId),
    new PrismaOutboxHandlerTracker(),
    bus,
    {
      owner: "killed-" + process.pid,
      leaseDurationSeconds: 30,
      heartbeatIntervalMs: 5000,
    },
  ).pollOnce();
  throw new Error(
    "Relay returned without reaching registration handler for " + eventId,
  );
}
run().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await prisma.$disconnect();
});
