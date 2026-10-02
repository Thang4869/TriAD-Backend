import prisma from "../src/core/database/prisma";
import { OutboxMaintenanceService } from "../src/core/outbox/outbox-maintenance.service";
import { PrismaOutboxMaintenanceStore } from "../src/core/outbox/prisma-outbox-maintenance.store";

function readIds(): string[] {
  const argument = process.argv.find((value) => value.startsWith("--ids="));

  if (!argument) {
    throw new Error(
      'Usage: npm run outbox:replay -- --ids="event-id-1,event-id-2"',
    );
  }

  return argument
    .slice("--ids=".length)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const ids = readIds();

  const service = new OutboxMaintenanceService(
    new PrismaOutboxMaintenanceStore(),
  );

  const result = await service.replayDeadLetters(ids);

  console.log(
    `Requeued ${result.replayedIds.length} dead-letter outbox event(s).`,
  );

  for (const event of result.events) {
    console.log(
      `${event.id} | ${event.eventName} | aggregate=${event.aggregateId}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error("Failed to replay dead-letter outbox events:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
