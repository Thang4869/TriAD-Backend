import { describe, it, expect } from "vitest";
import { Cart, CartItem } from "@modules/cart/domain/cart.entity";
import { Money } from "@shared/value-objects/money";
import {
  InvalidCartQuantityError,
  CartItemNotFoundError,
} from "@shared/domain/errors/domain-error";

function newCart(): Cart {
  return Cart.create("cart-1", "user-1");
}

describe("CartItem", () => {
  it("total = đơn giá × số lượng", () => {
    const item = new CartItem("p1", "Áo thun", new Money(50_000), 3);

    expect(item.total.getValue()).toBe(150_000);
  });

  it("increase() cộng thêm số lượng", () => {
    const item = new CartItem("p1", "Áo thun", new Money(50_000), 1);

    item.increase(2);

    expect(item.quantity).toBe(3);
  });

  it.each([0, -1])("increase(%s) bị từ chối vì không dương", (amount) => {
    const item = new CartItem("p1", "Áo thun", new Money(50_000), 1);

    expect(() => item.increase(amount)).toThrow(InvalidCartQuantityError);
  });

  it("decrease() trừ số lượng, cho phép về đúng 0", () => {
    const item = new CartItem("p1", "Áo thun", new Money(50_000), 2);

    item.decrease(2);

    expect(item.quantity).toBe(0);
  });

  it("decrease() vượt quá số lượng hiện có bị chặn", () => {
    const item = new CartItem("p1", "Áo thun", new Money(50_000), 2);

    expect(() => item.decrease(3)).toThrow(
      new InvalidCartQuantityError("Quantity cannot be negative"),
    );
    expect(item.quantity).toBe(2);
  });

  it.each([0, -5])("decrease(%s) bị từ chối vì không dương", (amount) => {
    const item = new CartItem("p1", "Áo thun", new Money(50_000), 2);

    expect(() => item.decrease(amount)).toThrow(InvalidCartQuantityError);
  });
});

describe("Cart.create", () => {
  it("giỏ mới rỗng: không item, total 0, itemCount 0", () => {
    const cart = newCart();

    expect(cart.id).toBe("cart-1");
    expect(cart.userId).toBe("user-1");
    expect(cart.items).toHaveLength(0);
    expect(cart.total.getValue()).toBe(0);
    expect(cart.itemCount).toBe(0);
  });
});

describe("Cart.addItem", () => {
  it("thêm sản phẩm mới và raise CartItemAdded", () => {
    const cart = newCart();

    cart.addItem("p1", "Áo thun", new Money(50_000), 2);

    expect(cart.items).toHaveLength(1);
    expect(cart.itemCount).toBe(2);
    expect(cart.total.getValue()).toBe(100_000);
    expect(cart.domainEvents[0].eventName).toBe("CartItemAdded");
    expect(cart.domainEvents[0].metadata).toMatchObject({
      productId: "p1",
      quantity: 2,
    });
  });

  it("thêm lại sản phẩm đã có thì cộng dồn số lượng, không tạo dòng mới", () => {
    const cart = newCart();
    cart.addItem("p1", "Áo thun", new Money(50_000), 2);

    cart.addItem("p1", "Áo thun", new Money(50_000), 3);

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(5);
    expect(cart.domainEvents).toHaveLength(2);
  });

  it.each([0, -1])("addItem với quantity = %s bị chặn", (quantity) => {
    const cart = newCart();

    expect(() => cart.addItem("p1", "Áo", new Money(1), quantity)).toThrow(
      InvalidCartQuantityError,
    );
    expect(cart.items).toHaveLength(0);
    expect(cart.domainEvents).toHaveLength(0);
  });

  it("total cộng dồn nhiều sản phẩm khác nhau", () => {
    const cart = newCart();

    cart.addItem("p1", "Áo", new Money(50_000), 2);
    cart.addItem("p2", "Quần", new Money(120_000), 1);

    expect(cart.total.getValue()).toBe(220_000);
    expect(cart.itemCount).toBe(3);
  });
});

describe("Cart.updateItemQuantity", () => {
  it("đặt số lượng mới và raise event với delta", () => {
    const cart = newCart();
    cart.addItem("p1", "Áo", new Money(50_000), 2);
    cart.pullEvents();

    cart.updateItemQuantity("p1", 5);

    expect(cart.items[0].quantity).toBe(5);
    expect(cart.domainEvents[0].metadata).toMatchObject({ quantity: 3 });
  });

  it("delta âm khi giảm số lượng", () => {
    const cart = newCart();
    cart.addItem("p1", "Áo", new Money(50_000), 5);
    cart.pullEvents();

    cart.updateItemQuantity("p1", 2);

    expect(cart.domainEvents[0].metadata).toMatchObject({ quantity: -3 });
  });

  it("đặt quantity = 0 tương đương xoá item (raise CartItemRemoved)", () => {
    const cart = newCart();
    cart.addItem("p1", "Áo", new Money(50_000), 2);
    cart.pullEvents();

    cart.updateItemQuantity("p1", 0);

    expect(cart.items).toHaveLength(0);
    expect(cart.domainEvents[0].eventName).toBe("CartItemRemoved");
  });

  it("quantity âm bị chặn", () => {
    const cart = newCart();
    cart.addItem("p1", "Áo", new Money(50_000), 2);

    expect(() => cart.updateItemQuantity("p1", -1)).toThrow(
      InvalidCartQuantityError,
    );
  });

  it("cập nhật sản phẩm không có trong giỏ ném CartItemNotFoundError", () => {
    const cart = newCart();

    expect(() => cart.updateItemQuantity("missing", 1)).toThrow(
      CartItemNotFoundError,
    );
  });
});

describe("Cart.removeItem", () => {
  it("xoá item có trong giỏ và raise CartItemRemoved", () => {
    const cart = newCart();
    cart.addItem("p1", "Áo", new Money(50_000), 2);
    cart.pullEvents();

    cart.removeItem("p1");

    expect(cart.items).toHaveLength(0);
    expect(cart.domainEvents[0].eventName).toBe("CartItemRemoved");
  });

  it("xoá item không tồn tại là no-op, không raise event và không ném lỗi", () => {
    const cart = newCart();

    cart.removeItem("missing");

    expect(cart.domainEvents).toHaveLength(0);
  });
});

describe("Cart.clear", () => {
  it("xoá hết item và raise CartCleared một lần duy nhất", () => {
    const cart = newCart();
    cart.addItem("p1", "Áo", new Money(50_000), 2);
    cart.addItem("p2", "Quần", new Money(80_000), 1);
    cart.pullEvents();

    cart.clear();

    expect(cart.items).toHaveLength(0);
    expect(cart.total.getValue()).toBe(0);
    expect(cart.domainEvents).toHaveLength(1);
    expect(cart.domainEvents[0].eventName).toBe("CartCleared");
  });

  it("clear giỏ rỗng là no-op, không raise event", () => {
    const cart = newCart();

    cart.clear();

    expect(cart.domainEvents).toHaveLength(0);
  });
});

describe("Cart.hydrate", () => {
  it("dựng lại giỏ từ dữ liệu DB với đầy đủ item", () => {
    const cart = Cart.hydrate({
      id: "cart-1",
      userId: "user-1",
      items: [
        { productId: "p1", productName: "Áo", price: 50_000, quantity: 2 },
        { productId: "p2", productName: "Quần", price: 80_000, quantity: 1 },
      ],
    });

    expect(cart.items).toHaveLength(2);
    expect(cart.itemCount).toBe(3);
    expect(cart.total.getValue()).toBe(180_000);
  });

  it("hydrate không sinh domain event (tránh gửi lại email/thông báo)", () => {
    const cart = Cart.hydrate({
      id: "cart-1",
      userId: "user-1",
      items: [
        { productId: "p1", productName: "Áo", price: 50_000, quantity: 2 },
      ],
    });

    expect(cart.domainEvents).toHaveLength(0);
    expect(cart.version).toBe(0);
  });

  it("hydrate danh sách rỗng cho giỏ rỗng hợp lệ", () => {
    const cart = Cart.hydrate({ id: "cart-1", userId: "user-1", items: [] });

    expect(cart.items).toHaveLength(0);
    expect(cart.total.getValue()).toBe(0);
  });
});
