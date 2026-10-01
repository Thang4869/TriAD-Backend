import prisma from "../src/core/database/prisma";
import { rebuildProductCatalogProjection } from "../src/core/outbox/rebuild-product-catalog-projection";

async function main(): Promise<void> {
  console.log("Rebuilding product catalog projection...");

  const processed = await rebuildProductCatalogProjection(prisma);

  console.log(
    `Product catalog projection rebuild completed. ${processed} products processed.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Failed to rebuild product catalog projection:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
