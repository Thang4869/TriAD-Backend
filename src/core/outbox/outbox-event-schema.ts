import { z } from "zod";
import { DomainEvent } from "@shared/domain/events/domain-event";

export const CURRENT_OUTBOX_EVENT_SCHEMA_VERSION = 1;

export interface OutboxEventIdentity {
  eventName: string;
  aggregateId: string;
}

export class InvalidOutboxEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOutboxEventError";
  }
}

const serializedDomainEventSchema = z
  .object({
    schemaVersion: z.number().int().positive().optional(),
    eventName: z.string().min(1),
    aggregateId: z.string().min(1),
    occurredAt: z.union([z.string().min(1), z.date()]),
    version: z.number().int().nonnegative().optional(),
    sourceVersion: z.number().int().nonnegative().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

export function deserializeOutboxEvent(
  payload: unknown,
  expected: OutboxEventIdentity,
): DomainEvent {
  const result = serializedDomainEventSchema.safeParse(payload);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "payload";
        return `${path}: ${issue.message}`;
      })
      .join("; ");

    throw new InvalidOutboxEventError(
      `Invalid outbox event payload: ${details}`,
    );
  }

  const serialized = result.data;

  // Rows persisted before schemaVersion was introduced are legacy v1.
  const schemaVersion =
    serialized.schemaVersion ?? CURRENT_OUTBOX_EVENT_SCHEMA_VERSION;

  if (schemaVersion !== CURRENT_OUTBOX_EVENT_SCHEMA_VERSION) {
    throw new InvalidOutboxEventError(
      `Unsupported outbox event schemaVersion: ${schemaVersion}`,
    );
  }

  if (serialized.eventName !== expected.eventName) {
    throw new InvalidOutboxEventError(
      `Outbox eventName mismatch: row=${expected.eventName}, payload=${serialized.eventName}`,
    );
  }

  if (serialized.aggregateId !== expected.aggregateId) {
    throw new InvalidOutboxEventError(
      `Outbox aggregateId mismatch: row=${expected.aggregateId}, payload=${serialized.aggregateId}`,
    );
  }

  const occurredAt =
    serialized.occurredAt instanceof Date
      ? new Date(serialized.occurredAt.getTime())
      : new Date(serialized.occurredAt);

  if (Number.isNaN(occurredAt.getTime())) {
    throw new InvalidOutboxEventError(
      `Invalid outbox event occurredAt: ${String(serialized.occurredAt)}`,
    );
  }

  const { schemaVersion: _schemaVersion, ...event } = serialized;

  return {
    ...event,
    eventName: serialized.eventName,
    aggregateId: serialized.aggregateId,
    occurredAt,
  };
}
