/*
  OrderStatus.REFUNDED is removed from the order lifecycle.

  Refund remains a PaymentStatus concern. Historical OrderStatus=REFUNDED
  rows must be reviewed explicitly instead of being silently remapped.
*/

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "orders"
    WHERE "status"::text = 'REFUNDED'
  ) THEN
    RAISE EXCEPTION
      'Cannot remove OrderStatus.REFUNDED: orders still contains REFUNDED rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "order_history_projection"
    WHERE "status"::text = 'REFUNDED'
  ) THEN
    RAISE EXCEPTION
      'Cannot remove OrderStatus.REFUNDED: order_history_projection still contains REFUNDED rows';
  END IF;
END
$$;

CREATE TYPE "OrderStatus_new" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED'
);

ALTER TABLE "orders"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "orders"
  ALTER COLUMN "status"
  TYPE "OrderStatus_new"
  USING ("status"::text::"OrderStatus_new");

ALTER TABLE "order_history_projection"
  ALTER COLUMN "status"
  TYPE "OrderStatus_new"
  USING ("status"::text::"OrderStatus_new");

ALTER TYPE "OrderStatus"
  RENAME TO "OrderStatus_old";

ALTER TYPE "OrderStatus_new"
  RENAME TO "OrderStatus";

ALTER TABLE "orders"
  ALTER COLUMN "status"
  SET DEFAULT 'PENDING'::"OrderStatus";

DROP TYPE "OrderStatus_old";

COMMIT;