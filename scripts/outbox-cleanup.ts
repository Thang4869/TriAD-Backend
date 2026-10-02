import prisma from "../src/core/database/prisma";
import { OutboxMaintenanceService } from "../src/core/outbox/outbox-maintenance.service";
import { PrismaOutboxMaintenanceStore } from "../src/core/outbox/prisma-outbox-maintenance.store";

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_LIMIT = 500;

function readPositiveInteger(name: string, defaultValue: number): number {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (!argument) return defaultValue;

  const value = Number(argument.slice(prefix.length));

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }

  return value;
}

async function main(): Promise<void> {
  const retentionDays = readPositiveInteger(
    "retention-days",
    DEFAULT_RETENTION_DAYS,
  );
  const limit = readPositiveInteger("limit", DEFAULT_LIMIT);

  const execute = process.argv.includes("--execute");

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const service = new OutboxMaintenanceService(
    new PrismaOutboxMaintenanceStore(),
  );

  const result = await service.cleanupPublished({
    cutoff,
    limit,
    dryRun: !execute,
  });

  console.log(`Retention cutoff: ${cutoff.toISOString()}`);
  console.log(`Eligible published events: ${result.eligibleCount}`);

  if (result.dryRun) {
    console.log(
      "Dry run only. Add --execute to delete eligible published events.",
    );
    return;
  }

  console.log(`Deleted ${result.deletedIds.length} published event(s).`);
}

main()
  .catch((error: unknown) => {
    console.error("Failed to clean up published outbox events:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
