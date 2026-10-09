import { Lifetime, type Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

import { PrismaProductsRepository } from "@modules/products/infrastructure/repositories/prisma-products.repository";
import { PrismaProductCatalogReadRepository } from "@modules/products/infrastructure/repositories/prisma-product-catalog-read.repository";
import { BullMqImageProcessingQueue } from "@modules/products/infrastructure/queue/bullmq-image-processing-queue";

import { CatalogService } from "@modules/products/services/catalog.service";
import { AdminProductService } from "@modules/products/services/admin-product.service";
import { ProductImageService } from "@modules/products/services/product-image.service";
import { ProductsController } from "@modules/products/products.controller";

export function registerProductsModule(container: Container): void {
  container.register(
    TOKENS.ProductsRepository,
    () => new PrismaProductsRepository(),
  );

  container.register(
    TOKENS.ProductCatalogRead,
    () => new PrismaProductCatalogReadRepository(),
  );

  container.register(
    TOKENS.ImageProcessingQueue,
    () => new BullMqImageProcessingQueue(),
  );

  container.register(
    TOKENS.ProductImageService,
    (c) =>
      new ProductImageService(
        c.resolve(TOKENS.ProductsRepository),
        c.resolve(TOKENS.ImageProcessingQueue),
      ),
  );

  container.register(
    TOKENS.CatalogService,
    (c) =>
      new CatalogService(
        c.resolve(TOKENS.ProductCatalogRead),
        c.resolve(TOKENS.ProductsRepository),
      ),
  );

  container.register(
    TOKENS.AdminProductService,
    (c) =>
      new AdminProductService(
        c.resolve(TOKENS.ProductsRepository),
        c.resolve(TOKENS.ProductImageService),
      ),
  );

  container.register(
    TOKENS.ProductsController,
    (c) =>
      new ProductsController(
        c.resolve(TOKENS.CatalogService),
        c.resolve(TOKENS.AdminProductService),
      ),
    Lifetime.Transient,
  );
}
