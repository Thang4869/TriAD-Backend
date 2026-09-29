import prisma from "../src/core/database/prisma";
import { rebuildOrderHistoryProjection } from "../src/core/outbox/rebuild-order-history-projection";

async function main(): Promise<void> {
  console.log("Rebuilding order history projection...");

  const processed = await rebuildOrderHistoryProjection(prisma);

  console.log(
    `Order history projection rebuild completed. ${processed} orders processed.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Failed to rebuild order history projection:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
