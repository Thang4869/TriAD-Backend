CREATE TABLE "product_catalog_projection" (
  "productId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" DOUBLE PRECISION NOT NULL,
  "stock" INTEGER NOT NULL,
  "category" TEXT NOT NULL,
  "images" TEXT[] NOT NULL,
  "slug" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL,
  "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reviewCount" INTEGER NOT NULL DEFAULT 0,
  "searchText" TEXT NOT NULL,
  "sourceVersion" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_catalog_projection_pkey" PRIMARY KEY ("productId")
);
CREATE UNIQUE INDEX "product_catalog_projection_slug_key" ON "product_catalog_projection"("slug");
CREATE INDEX "product_catalog_projection_isActive_category_price_idx" ON "product_catalog_projection"("isActive", "category", "price");
CREATE INDEX "product_catalog_projection_updatedAt_idx" ON "product_catalog_projection"("updatedAt");

CREATE TABLE "order_history_projection" (
  "orderId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL,
  "paymentStatus" "PaymentStatus" NOT NULL,
  "subtotal" DOUBLE PRECISION NOT NULL,
  "tax" DOUBLE PRECISION NOT NULL,
  "shippingFee" DOUBLE PRECISION NOT NULL,
  "total" DOUBLE PRECISION NOT NULL,
  "items" JSONB NOT NULL,
  "placedAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_history_projection_pkey" PRIMARY KEY ("orderId")
);
CREATE INDEX "order_history_projection_userId_placedAt_idx" ON "order_history_projection"("userId", "placedAt");
CREATE INDEX "order_history_projection_userId_status_placedAt_idx" ON "order_history_projection"("userId", "status", "placedAt");

CREATE TABLE "admin_dashboard_projection" (
  "id" TEXT NOT NULL,
  "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalOrders" INTEGER NOT NULL DEFAULT 0,
  "pendingOrders" INTEGER NOT NULL DEFAULT 0,
  "completedOrders" INTEGER NOT NULL DEFAULT 0,
  "totalUsers" INTEGER NOT NULL DEFAULT 0,
  "totalProducts" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_dashboard_projection_pkey" PRIMARY KEY ("id")
);