CREATE TABLE "saga_states" (
  "id" TEXT NOT NULL,
  "sagaType" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saga_states_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "saga_states_sagaType_completedAt_idx"
  ON "saga_states" ("sagaType", "completedAt");