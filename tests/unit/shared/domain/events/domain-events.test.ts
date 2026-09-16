import { describe, it, expect } from "vitest";
import { BaseDomainEvent } from "@shared/domain/events/domain-event";
import {
  ProductStockDepletedEvent,
  ProductRestockedEvent,
  ProductPriceChangedEvent,
  ProductActivatedEvent,
  ProductDeactivatedEvent,
} from "@shared/domain/events/product-events";
import {
  UserRegisteredEvent,
  UserEmailVerifiedEvent,
  UserPasswordChangedEvent,
  UserTwoFactorEnabledEvent,
  UserTwoFactorDisabledEvent,
} from "@shared/domain/events/user-events";

const cases: Array<{
  label: string;
  build: () => BaseDomainEvent;
  eventName: string;
  aggregateId: string;
  metadata?: Record<string, unknown>;
}> = [
  {
    label: "ProductStockDepletedEvent",
    build: () => new ProductStockDepletedEvent("p1", "Bàn phím"),
    eventName: "ProductStockDepleted",
    aggregateId: "p1",
    metadata: { productName: "Bàn phím" },
  },
  {
    label: "ProductRestockedEvent",
    build: () => new ProductRestockedEvent("p1", 10, 12),
    eventName: "ProductRestocked",
    aggregateId: "p1",
    metadata: { quantityAdded: 10, newStock: 12 },
  },
  {
    label: "ProductPriceChangedEvent",
    build: () => new ProductPriceChangedEvent("p1", 100, 150),
    eventName: "ProductPriceChanged",
    aggregateId: "p1",
    metadata: { oldPrice: 100, newPrice: 150 },
  },
  {
    label: "ProductActivatedEvent",
    build: () => new ProductActivatedEvent("p1"),
    eventName: "ProductActivated",
    aggregateId: "p1",
  },
  {
    label: "ProductDeactivatedEvent",
    build: () => new ProductDeactivatedEvent("p1"),
    eventName: "ProductDeactivated",
    aggregateId: "p1",
  },
  {
    label: "UserRegisteredEvent",
    build: () => new UserRegisteredEvent("u1", "a@b.com"),
    eventName: "UserRegistered",
    aggregateId: "u1",
    metadata: { email: "a@b.com" },
  },
  {
    label: "UserEmailVerifiedEvent",
    build: () => new UserEmailVerifiedEvent("u1"),
    eventName: "UserEmailVerified",
    aggregateId: "u1",
  },
  {
    label: "UserPasswordChangedEvent",
    build: () => new UserPasswordChangedEvent("u1"),
    eventName: "UserPasswordChanged",
    aggregateId: "u1",
  },
  {
    label: "UserTwoFactorEnabledEvent",
    build: () => new UserTwoFactorEnabledEvent("u1"),
    eventName: "UserTwoFactorEnabled",
    aggregateId: "u1",
  },
  {
    label: "UserTwoFactorDisabledEvent",
    build: () => new UserTwoFactorDisabledEvent("u1"),
    eventName: "UserTwoFactorDisabled",
    aggregateId: "u1",
  },
];

describe("domain events", () => {
  it.each(cases)("$label mang đúng envelope", (c) => {
    const event = c.build();

    expect(event).toBeInstanceOf(BaseDomainEvent);
    expect(event.eventName).toBe(c.eventName);
    expect(event.aggregateId).toBe(c.aggregateId);
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.metadata).toEqual(c.metadata);
  });

  it("expose eventName dạng static để subscriber tham chiếu", () => {
    expect(ProductRestockedEvent.eventName).toBe("ProductRestocked");
    expect(UserRegisteredEvent.eventName).toBe("UserRegistered");
  });

  it("expose các field payload đã typed", () => {
    const e = new ProductPriceChangedEvent("p9", 1000, 2000);
    expect(e.productId).toBe("p9");
    expect(e.oldPrice).toBe(1000);
    expect(e.newPrice).toBe(2000);

    const u = new UserRegisteredEvent("u9", "x@y.z");
    expect(u.userId).toBe("u9");
    expect(u.email).toBe("x@y.z");
  });

  it("sống sót qua vòng JSON (serialise vào outbox)", () => {
    const e = new ProductStockDepletedEvent("p1", "Chuột");
    const parsed = JSON.parse(JSON.stringify(e));
    expect(parsed.eventName).toBe("ProductStockDepleted");
    expect(parsed.metadata.productName).toBe("Chuột");
  });
});
