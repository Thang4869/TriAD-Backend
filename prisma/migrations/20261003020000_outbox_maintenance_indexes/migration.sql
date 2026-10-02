-- Relay claim path:
-- unpublished + non-dead-letter rows ordered by occurredAt.
CREATE INDEX IF NOT EXISTS "outbox_events_relay_claim_idx"
ON "outbox_events" ("attempts", "leaseUntil", "occurredAt")
WHERE "publishedAt" IS NULL
  AND "deadLetteredAt" IS NULL;

-- Maintenance cleanup path:
-- published rows are removed in publishedAt order after the retention cutoff.
CREATE INDEX IF NOT EXISTS "outbox_events_published_cleanup_idx"
ON "outbox_events" ("publishedAt")
WHERE "publishedAt" IS NOT NULL;
