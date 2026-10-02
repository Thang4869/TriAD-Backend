DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "products" WHERE "price" < 0)
     OR EXISTS (SELECT 1 FROM "orders" WHERE "subtotal" < 0 OR "tax" < 0 OR "shippingFee" < 0 OR "total" < 0 OR "discountAmount" < 0)
     OR EXISTS (SELECT 1 FROM "order_items" WHERE "price" < 0 OR "total" < 0)
     OR EXISTS (SELECT 1 FROM "discounts" WHERE "value" < 0 OR "minOrderAmount" < 0)
     OR EXISTS (SELECT 1 FROM "product_catalog_projection" WHERE "price" < 0)
     OR EXISTS (SELECT 1 FROM "order_history_projection" WHERE "subtotal" < 0 OR "tax" < 0 OR "shippingFee" < 0 OR "total" < 0)
     OR EXISTS (SELECT 1 FROM "admin_dashboard_projection" WHERE "totalGrossOrderValue" < 0) THEN
    RAISE EXCEPTION 'Cannot add monetary invariants while negative values exist';
  END IF;
END $$;

ALTER TABLE "products"
  ADD CONSTRAINT "products_price_nonnegative" CHECK ("price" >= 0);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_money_nonnegative" CHECK (
    "subtotal" >= 0 AND "tax" >= 0 AND "shippingFee" >= 0
    AND "total" >= 0 AND "discountAmount" >= 0
  );

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_money_nonnegative" CHECK ("price" >= 0 AND "total" >= 0);

ALTER TABLE "discounts"
  ADD CONSTRAINT "discounts_money_nonnegative" CHECK ("value" >= 0 AND ("minOrderAmount" IS NULL OR "minOrderAmount" >= 0));

ALTER TABLE "product_catalog_projection"
  ADD CONSTRAINT "product_catalog_projection_price_nonnegative" CHECK ("price" >= 0);

ALTER TABLE "order_history_projection"
  ADD CONSTRAINT "order_history_projection_money_nonnegative" CHECK (
    "subtotal" >= 0 AND "tax" >= 0 AND "shippingFee" >= 0 AND "total" >= 0
  );

ALTER TABLE "admin_dashboard_projection"
  ADD CONSTRAINT "admin_dashboard_projection_gross_nonnegative" CHECK ("totalGrossOrderValue" >= 0);
