import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { OrderStatus } from "@prisma/client";
import { Order } from "@/modules/orders/domain/order.entity";

function orderAt(status: OrderStatus): Order {
  return Order.hydrate({
    id: "o1",
    userId: "u1",
    orderNumber: "ORD-1",
    status,
    createdAt: new Date(),
    customerName: "Test",
    customerEmail: "test@test.com",
    customerPhone: "0123456789",
    customerAddress: "Somewhere",
    paymentMethod: "COD",
    paymentStatus: "PENDING",
    discountAmount: 0,
    shippingFee: 0,
    tax: 0,
    items: [{ productId: "p1", productName: "P1", quantity: 1, price: 1000 }],
  });
}

type Action = "confirm" | "ship" | "deliver" | "cancel";
const ACTIONS: Action[] = ["confirm", "ship", "deliver", "cancel"];

function apply(order: Order, action: Action): void {
  order[action]();
}

function expectedNextStatus(
  current: OrderStatus,
  action: Action,
): OrderStatus | null {
  const target: Record<Action, OrderStatus> = {
    confirm: OrderStatus.PROCESSING,
    ship: OrderStatus.SHIPPED,
    deliver: OrderStatus.DELIVERED,
    cancel: OrderStatus.CANCELLED,
  };
  return Order.canTransition(current, target[action]) ? target[action] : null;
}

describe("Order status state machine (property-based)", () => {
  const allStatuses = Object.values(OrderStatus);

  it("every action either follows the declared transition table or throws without mutating status", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allStatuses),
        fc.array(fc.constantFrom(...ACTIONS), { minLength: 0, maxLength: 15 }),
        (startStatus, actions) => {
          const order = orderAt(startStatus as OrderStatus);
          let expected = startStatus as OrderStatus;

          for (const action of actions) {
            const allowed = expectedNextStatus(expected, action);

            if (allowed) {
              apply(order, action);
              expected = allowed;
              expect(order.status).toBe(expected);
            } else {
              expect(() => apply(order, action)).toThrow();
              // A rejected transition must be a true no-op.
              expect(order.status).toBe(expected);
            }
          }
        },
      ),
    );
  });

  it("terminal statuses (DELIVERED, CANCELLED, REFUNDED) never accept any further action", () => {
    const terminal = [
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
      OrderStatus.REFUNDED,
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...terminal),
        fc.constantFrom(...ACTIONS),
        (status, action) => {
          const order = orderAt(status);
          expect(() => apply(order, action)).toThrow();
          expect(order.status).toBe(status);
        },
      ),
    );
  });
});
