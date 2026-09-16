import { describe, it, expect } from "vitest";
import { Order, OrderItem } from "@modules/orders/domain/order.entity";
import { OrderStatus } from "@modules/orders/domain/order-status";
import { Money } from "@shared/value-objects/money";
import {
  OrderNotMutableError,
  InvalidOrderItemError,
  InvalidDiscountError,
  EmptyOrderError,
  OrderAlreadyPlacedError,
  InvalidOrderTransitionError,
  OrderNotCancellableError,
} from "@shared/domain/errors/domain-error";

function newOrder(notes?: string) {
  return Order.create({
    id: "ord-1",
    userId: "user-1",
    orderNumber: "DH-0001",
    customerName: "Nguyễn Văn A",
    customerEmail: "a@example.com",
    customerPhone: "0900000000",
    customerAddress: "123 Lê Lợi",
    paymentMethod: "COD",
    notes,
  });
}

function placedOrder() {
  const order = newOrder();
  order.addItem("p1", "Áo", 2, new Money(100_000));
  order.place();
  order.pullEvents();
  return order;
}

describe("OrderItem", () => {
  it("tính total = unitPrice * quantity", () => {
    const item = new OrderItem("p1", "Áo", 3, new Money(50_000));
    expect(item.total.getValue()).toBe(150_000);
  });

  it("total bằng 0 khi giá bằng 0", () => {
    expect(new OrderItem("p1", "Quà", 5, new Money(0)).total.getValue()).toBe(
      0,
    );
  });
});

describe("Order.create", () => {
  it("khởi tạo ở trạng thái PENDING với các khoản tiền bằng 0", () => {
    const order = newOrder("Giao giờ hành chính");

    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.items).toEqual([]);
    expect(order.subtotal.getValue()).toBe(0);
    expect(order.total.getValue()).toBe(0);
    expect(order.tax.getValue()).toBe(0);
    expect(order.shippingFee.getValue()).toBe(0);
    expect(order.discountAmount.getValue()).toBe(0);
    expect(order.discountCode).toBeUndefined();
    expect(order.notes).toBe("Giao giờ hành chính");
    expect(order.paymentStatus).toBe("PENDING");
    expect(order.createdAt).toBeInstanceOf(Date);
    expect(order.domainEvents).toEqual([]);
  });
});

describe("Order.addItem", () => {
  it("thêm item mới vào đơn", () => {
    const order = newOrder();
    order.addItem("p1", "Áo", 2, new Money(100_000));

    expect(order.items).toHaveLength(1);
    expect(order.subtotal.getValue()).toBe(200_000);
  });

  it("cộng dồn số lượng khi thêm trùng productId và dùng giá mới nhất", () => {
    const order = newOrder();
    order.addItem("p1", "Áo", 2, new Money(100_000));
    order.addItem("p1", "Áo", 3, new Money(120_000));

    expect(order.items).toHaveLength(1);
    expect(order.items[0].quantity).toBe(5);
    expect(order.items[0].unitPrice.getValue()).toBe(120_000);
    expect(order.subtotal.getValue()).toBe(600_000);
  });

  it("từ chối số lượng <= 0", () => {
    const order = newOrder();
    expect(() => order.addItem("p1", "Áo", 0, new Money(1))).toThrow(
      InvalidOrderItemError,
    );
    expect(() => order.addItem("p1", "Áo", -1, new Money(1))).toThrow(
      InvalidOrderItemError,
    );
  });

  it("không cho sửa đơn đã place", () => {
    const order = placedOrder();
    expect(() => order.addItem("p2", "Quần", 1, new Money(1))).toThrow(
      OrderNotMutableError,
    );
  });

  it("không cho sửa đơn không còn PENDING", () => {
    const order = Order.hydrate(hydrateData({ status: OrderStatus.SHIPPED }));
    expect(() => order.addItem("p2", "Quần", 1, new Money(1))).toThrow(
      OrderNotMutableError,
    );
  });
});

describe("Order.removeItem", () => {
  it("xoá item theo productId", () => {
    const order = newOrder();
    order.addItem("p1", "Áo", 1, new Money(10));
    order.addItem("p2", "Quần", 1, new Money(20));

    order.removeItem("p1");

    expect(order.items.map((i) => i.productId)).toEqual(["p2"]);
  });

  it("bỏ qua im lặng khi productId không tồn tại", () => {
    const order = newOrder();
    order.addItem("p1", "Áo", 1, new Money(10));
    expect(() => order.removeItem("khong-ton-tai")).not.toThrow();
    expect(order.items).toHaveLength(1);
  });

  it("không cho xoá khi đơn đã place", () => {
    expect(() => placedOrder().removeItem("p1")).toThrow(OrderNotMutableError);
  });
});

describe("Order.applyPricing", () => {
  it("gán thuế, phí ship, giảm giá và mã giảm giá", () => {
    const order = newOrder();
    order.addItem("p1", "Áo", 1, new Money(100_000));

    order.applyPricing({
      tax: new Money(8_000),
      shippingFee: new Money(20_000),
      discountAmount: new Money(10_000),
      discountCode: "SALE10",
    });

    expect(order.tax.getValue()).toBe(8_000);
    expect(order.shippingFee.getValue()).toBe(20_000);
    expect(order.discountAmount.getValue()).toBe(10_000);
    expect(order.discountCode).toBe("SALE10");
    expect(order.total.getValue()).toBe(118_000);
  });

  it("cho phép giảm giá đúng bằng subtotal (biên)", () => {
    const order = newOrder();
    order.addItem("p1", "Áo", 1, new Money(100_000));

    order.applyPricing({
      tax: new Money(0),
      shippingFee: new Money(0),
      discountAmount: new Money(100_000),
    });

    expect(order.total.getValue()).toBe(0);
    expect(order.discountCode).toBeUndefined();
  });

  it("từ chối giảm giá vượt subtotal", () => {
    const order = newOrder();
    order.addItem("p1", "Áo", 1, new Money(100_000));

    expect(() =>
      order.applyPricing({
        tax: new Money(0),
        shippingFee: new Money(0),
        discountAmount: new Money(100_001),
      }),
    ).toThrow(InvalidDiscountError);
  });

  it("không cho áp giá khi đơn đã place", () => {
    expect(() =>
      placedOrder().applyPricing({
        tax: new Money(0),
        shippingFee: new Money(0),
        discountAmount: new Money(0),
      }),
    ).toThrow(OrderNotMutableError);
  });
});

describe("Order.total", () => {
  it("không bao giờ âm dù giảm giá lớn hơn tổng sau thuế/ship", () => {
    const order = Order.hydrate(
      hydrateData({
        discountAmount: 500_000,
        items: [{ productId: "p1", productName: "Áo", quantity: 1, price: 10 }],
      }),
    );
    expect(order.total.getValue()).toBe(0);
  });
});

describe("Order.place", () => {
  it("phát OrderPlacedEvent với tổng tiền và danh sách item", () => {
    const order = newOrder();
    order.addItem("p1", "Áo", 2, new Money(100_000));
    order.applyPricing({
      tax: new Money(0),
      shippingFee: new Money(30_000),
      discountAmount: new Money(0),
    });

    order.place();

    const events = order.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe("OrderPlaced");
    expect(events[0].aggregateId).toBe("ord-1");
    expect(order.version).toBe(1);
  });

  it("từ chối đơn rỗng", () => {
    expect(() => newOrder().place()).toThrow(EmptyOrderError);
  });

  it("từ chối place lần hai", () => {
    expect(() => placedOrder().place()).toThrow(OrderAlreadyPlacedError);
  });
});

describe("state machine", () => {
  it("PENDING -> PROCESSING -> SHIPPED -> DELIVERED", () => {
    const order = placedOrder();

    order.confirm();
    expect(order.status).toBe(OrderStatus.PROCESSING);
    order.ship();
    expect(order.status).toBe(OrderStatus.SHIPPED);
    order.deliver();
    expect(order.status).toBe(OrderStatus.DELIVERED);

    const events = order.pullEvents();
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.eventName === "OrderStatusChanged")).toBe(
      true,
    );
  });

  it.each([
    ["ship khi đang PENDING", (o: Order) => o.ship()],
    ["deliver khi đang PENDING", (o: Order) => o.deliver()],
  ])("chặn bước nhảy không hợp lệ: %s", (_label, act) => {
    const order = placedOrder();
    expect(() => act(order)).toThrow(InvalidOrderTransitionError);
    expect(order.status).toBe(OrderStatus.PENDING);
  });

  it("huỷ đơn PENDING phát cả StatusChanged và Cancelled", () => {
    const order = placedOrder();

    order.cancel();

    expect(order.status).toBe(OrderStatus.CANCELLED);
    const names = order.pullEvents().map((e) => e.eventName);
    expect(names).toEqual(["OrderStatusChanged", "OrderCancelled"]);
  });

  it("huỷ được đơn đang PROCESSING", () => {
    const order = placedOrder();
    order.confirm();
    order.cancel();
    expect(order.status).toBe(OrderStatus.CANCELLED);
  });

  it("không huỷ được đơn đã DELIVERED", () => {
    const order = Order.hydrate(hydrateData({ status: OrderStatus.DELIVERED }));
    expect(() => order.cancel()).toThrow(OrderNotCancellableError);
  });

  it("không huỷ được đơn đã CANCELLED", () => {
    const order = Order.hydrate(hydrateData({ status: OrderStatus.CANCELLED }));
    expect(() => order.cancel()).toThrow(OrderNotCancellableError);
  });

  it("đơn SHIPPED không huỷ được vì bảng chuyển trạng thái không cho phép", () => {
    const order = Order.hydrate(hydrateData({ status: OrderStatus.SHIPPED }));
    expect(() => order.cancel()).toThrow(InvalidOrderTransitionError);
  });
});

describe("Order.canTransition", () => {
  const allowed: Array<[OrderStatus, OrderStatus]> = [
    [OrderStatus.PENDING, OrderStatus.PROCESSING],
    [OrderStatus.PENDING, OrderStatus.CANCELLED],
    [OrderStatus.PROCESSING, OrderStatus.SHIPPED],
    [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
    [OrderStatus.SHIPPED, OrderStatus.DELIVERED],
  ];

  it.each(allowed)("cho phép %s -> %s", (from, to) => {
    expect(Order.canTransition(from, to)).toBe(true);
  });

  it.each([
    [OrderStatus.DELIVERED, OrderStatus.PENDING],
    [OrderStatus.CANCELLED, OrderStatus.PROCESSING],
    [OrderStatus.REFUNDED, OrderStatus.PENDING],
    [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
    [OrderStatus.PENDING, OrderStatus.DELIVERED],
  ])("chặn %s -> %s", (from, to) => {
    expect(Order.canTransition(from, to)).toBe(false);
  });

  it("trả về false cho trạng thái không nằm trong bảng", () => {
    expect(
      Order.canTransition("UNKNOWN" as OrderStatus, OrderStatus.PENDING),
    ).toBe(false);
  });
});

function hydrateData(
  overrides: Partial<Parameters<typeof Order.hydrate>[0]> = {},
): Parameters<typeof Order.hydrate>[0] {
  return {
    id: "ord-1",
    userId: "user-1",
    orderNumber: "DH-0001",
    status: OrderStatus.PENDING,
    createdAt: new Date("2026-01-01"),
    customerName: "Nguyễn Văn A",
    customerEmail: "a@example.com",
    customerPhone: "0900000000",
    customerAddress: "123 Lê Lợi",
    paymentMethod: "COD",
    paymentStatus: "PENDING",
    discountAmount: 0,
    shippingFee: 0,
    tax: 0,
    items: [
      { productId: "p1", productName: "Áo", quantity: 2, price: 100_000 },
    ],
    ...overrides,
  };
}

describe("Order.hydrate", () => {
  it("dựng lại đơn từ DB kèm item và coi như đã place", () => {
    const order = Order.hydrate(
      hydrateData({ discountCode: "SALE", notes: "gọi trước", version: 4 }),
    );

    expect(order.items).toHaveLength(1);
    expect(order.subtotal.getValue()).toBe(200_000);
    expect(order.discountCode).toBe("SALE");
    expect(order.notes).toBe("gọi trước");
    expect(order.version).toBe(4);
    expect(order.domainEvents).toEqual([]);
    expect(() => order.addItem("p2", "Quần", 1, new Money(1))).toThrow(
      OrderNotMutableError,
    );
  });

  it("giữ version mặc định 0 khi DB không trả về version", () => {
    expect(Order.hydrate(hydrateData()).version).toBe(0);
  });

  it("dựng lại được đơn không có item nào", () => {
    const order = Order.hydrate(hydrateData({ items: [] }));
    expect(order.items).toEqual([]);
    expect(order.subtotal.getValue()).toBe(0);
  });
});
