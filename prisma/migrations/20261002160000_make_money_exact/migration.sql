DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "products"
    WHERE "price" IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
  ) OR EXISTS (
    SELECT 1 FROM "orders"
    WHERE "subtotal" IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
       OR "tax" IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
       OR "shippingFee" IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
       OR "total" IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
       OR "discountAmount" IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
  ) OR EXISTS (
    SELECT 1 FROM "order_items"
    WHERE "price" IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
       OR "total" IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
  ) OR EXISTS (
    SELECT 1 FROM "discounts"
    WHERE "value" IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
       OR "minOrderAmount" IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
  ) OR EXISTS (
    SELECT 1 FROM "product_catalog_projection"
    WHERE "price" IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
  ) OR EXISTS (
    SELECT 1 FROM "order_history_projection"
    WHERE "subtotal" IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
       OR "tax" IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
       OR "shippingFee" IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
       OR "total" IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
  ) OR EXISTS (
    SELECT 1 FROM "admin_dashboard_projection"
    WHERE "totalGrossOrderValue" IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
  ) THEN
    RAISE EXCEPTION 'Cannot migrate invalid non-finite monetary values';
  END IF;
END $$;

ALTER TABLE "products"
  ALTER COLUMN "price" TYPE DECIMAL(18, 0)
  USING ROUND("price"::numeric)::numeric;

ALTER TABLE "orders"
  ALTER COLUMN "subtotal" TYPE DECIMAL(18, 0) USING ROUND("subtotal"::numeric)::numeric,
  ALTER COLUMN "tax" TYPE DECIMAL(18, 0) USING ROUND("tax"::numeric)::numeric,
  ALTER COLUMN "shippingFee" TYPE DECIMAL(18, 0) USING ROUND("shippingFee"::numeric)::numeric,
  ALTER COLUMN "total" TYPE DECIMAL(18, 0) USING ROUND("total"::numeric)::numeric,
  ALTER COLUMN "discountAmount" TYPE DECIMAL(18, 0) USING ROUND("discountAmount"::numeric)::numeric;

ALTER TABLE "order_items"
  ALTER COLUMN "price" TYPE DECIMAL(18, 0) USING ROUND("price"::numeric)::numeric,
  ALTER COLUMN "total" TYPE DECIMAL(18, 0) USING ROUND("total"::numeric)::numeric;

ALTER TABLE "discounts"
  ALTER COLUMN "value" TYPE DECIMAL(18, 4) USING ROUND("value"::numeric, 4)::numeric,
  ALTER COLUMN "minOrderAmount" TYPE DECIMAL(18, 0) USING ROUND("minOrderAmount"::numeric)::numeric;

ALTER TABLE "product_catalog_projection"
  ALTER COLUMN "price" TYPE DECIMAL(18, 0) USING ROUND("price"::numeric)::numeric;

ALTER TABLE "order_history_projection"
  ALTER COLUMN "subtotal" TYPE DECIMAL(18, 0) USING ROUND("subtotal"::numeric)::numeric,
  ALTER COLUMN "tax" TYPE DECIMAL(18, 0) USING ROUND("tax"::numeric)::numeric,
  ALTER COLUMN "shippingFee" TYPE DECIMAL(18, 0) USING ROUND("shippingFee"::numeric)::numeric,
  ALTER COLUMN "total" TYPE DECIMAL(18, 0) USING ROUND("total"::numeric)::numeric;

ALTER TABLE "admin_dashboard_projection"
  ALTER COLUMN "totalGrossOrderValue" TYPE DECIMAL(18, 0)
  USING ROUND("totalGrossOrderValue"::numeric)::numeric;
