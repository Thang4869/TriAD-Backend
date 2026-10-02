ALTER TABLE "order_history_projection"
ADD COLUMN "sourceVersion" INTEGER NOT NULL DEFAULT 0;

UPDATE "order_history_projection"
SET "sourceVersion" = -1;

UPDATE "product_catalog_projection"
SET "sourceVersion" = -1;