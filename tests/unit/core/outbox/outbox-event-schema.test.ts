import { describe, expect, it } from "vitest";
import {
  CURRENT_OUTBOX_EVENT_SCHEMA_VERSION,
  InvalidOutboxEventError,
  deserializeOutboxEvent,
} from "@core/outbox/outbox-event-schema";

const IDENTITY = {
  eventName: "OrderPlaced",
  aggregateId: "order-1",
};

function validPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: CURRENT_OUTBOX_EVENT_SCHEMA_VERSION,
    eventName: "OrderPlaced",
    aggregateId: "order-1",
    occurredAt: "2026-10-03T00:00:00.000Z",
    sourceVersion: 0,
    orderId: "order-1",
    userId: "user-1",
    ...overrides,
  };
}

describe("deserializeOutboxEvent", () => {
  it("deserializes a valid versioned event and preserves business fields", () => {
    const event = deserializeOutboxEvent(validPayload(), IDENTITY);

    expect(event).toMatchObject({
      eventName: "OrderPlaced",
      aggregateId: "order-1",
      sourceVersion: 0,
      orderId: "order-1",
      userId: "user-1",
    });

    expect(event.occurredAt).toEqual(new Date("2026-10-03T00:00:00.000Z"));

    expect(event).not.toHaveProperty("schemaVersion");
  });

  it("accepts legacy events without schemaVersion as version 1", () => {
    const payload = validPayload();

    delete payload.schemaVersion;

    const event = deserializeOutboxEvent(payload, IDENTITY);

    expect(event.eventName).toBe("OrderPlaced");
    expect(event.aggregateId).toBe("order-1");
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it("accepts an occurredAt Date and returns a defensive Date copy", () => {
    const original = new Date("2026-10-03T00:00:00.000Z");

    const event = deserializeOutboxEvent(
      validPayload({ occurredAt: original }),
      IDENTITY,
    );

    expect(event.occurredAt).toEqual(original);
    expect(event.occurredAt).not.toBe(original);
  });

  it("rejects a non-object payload", () => {
    expect(() => deserializeOutboxEvent("invalid", IDENTITY)).toThrow(
      InvalidOutboxEventError,
    );

    expect(() => deserializeOutboxEvent("invalid", IDENTITY)).toThrow(
      "Invalid outbox event payload",
    );
  });

  it("rejects an unsupported schemaVersion", () => {
    expect(() =>
      deserializeOutboxEvent(validPayload({ schemaVersion: 2 }), IDENTITY),
    ).toThrow("Unsupported outbox event schemaVersion: 2");
  });

  it("rejects an eventName that disagrees with the outbox row", () => {
    expect(() =>
      deserializeOutboxEvent(
        validPayload({ eventName: "OrderCancelled" }),
        IDENTITY,
      ),
    ).toThrow(
      "Outbox eventName mismatch: row=OrderPlaced, payload=OrderCancelled",
    );
  });

  it("rejects an aggregateId that disagrees with the outbox row", () => {
    expect(() =>
      deserializeOutboxEvent(
        validPayload({ aggregateId: "order-2" }),
        IDENTITY,
      ),
    ).toThrow("Outbox aggregateId mismatch: row=order-1, payload=order-2");
  });

  it("rejects an invalid occurredAt value", () => {
    expect(() =>
      deserializeOutboxEvent(
        validPayload({ occurredAt: "not-a-date" }),
        IDENTITY,
      ),
    ).toThrow("Invalid outbox event occurredAt: not-a-date");
  });

  it.each([
    ["sourceVersion", -1],
    ["sourceVersion", 1.5],
    ["version", -1],
    ["version", 1.5],
  ])("rejects invalid %s=%s", (field, value) => {
    expect(() =>
      deserializeOutboxEvent(validPayload({ [field]: value }), IDENTITY),
    ).toThrow("Invalid outbox event payload");
  });

  it("rejects metadata that is not an object map", () => {
    expect(() =>
      deserializeOutboxEvent(
        validPayload({
          metadata: ["not", "an", "object-map"],
        }),
        IDENTITY,
      ),
    ).toThrow("Invalid outbox event payload");
  });
});
