/*
  Scope checkout idempotency keys by user.

  This allows different users to use the same idempotency key while
  preventing duplicate checkout orders for the same user and key.
*/

-- DropIndex
DROP INDEX "orders_idempotencyKey_key";

-- CreateIndex
CREATE UNIQUE INDEX "orders_userId_idempotencyKey_key"
ON "orders"("userId", "idempotencyKey");