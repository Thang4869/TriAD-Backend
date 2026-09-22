ALTER TABLE "outbox_events"
  ADD COLUMN "lockOwner" TEXT,
  ADD COLUMN "leaseUntil" TIMESTAMP(3);

CREATE INDEX "outbox_events_leaseUntil_idx" ON "outbox_events" ("leaseUntil");