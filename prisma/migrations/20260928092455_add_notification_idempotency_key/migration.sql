/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `notifications` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "notifications_idempotencyKey_key"
ON "notifications"("idempotencyKey");
