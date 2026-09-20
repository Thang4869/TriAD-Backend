import { describe, it, expect } from "vitest";
import { Product } from "@modules/products/domain/product.entity";
import { Money } from "@shared/value-objects/money";
import {
  InvalidPriceError,
  InvalidStockQuantityError,
  InsufficientStockError,
  ProductAlreadyActiveError,
  ProductAlreadyInactiveError,
} from "@shared/domain/errors/domain-error";

function newProduct(
  overrides: Partial<Parameters<typeof Product.hydrate>[0]> = {},
) {
  return Product.hydrate({
    id: "prod-1",
    name: "Áo thun",
    description: "Mô tả",
    price: 100_000,
    stock: 10,
    category: "ao",
    images: ["a.jpg"],
    slug: "ao-thun",
    isActive: true,
    ...overrides,
  });
}

describe("Product.hydrate", () => {
  it("map đầy đủ field từ dữ liệu DB", () => {
    const product = newProduct();

    expect(product.id).toBe("prod-1");
    expect(product.name).toBe("Áo thun");
    expect(product.price.getValue()).toBe(100_000);
    expect(product.stock).toBe(10);
    expect(product.isActive).toBe(true);
    expect(product.images).toEqual(["a.jpg"]);
  });

  it("khôi phục version từ DB để phục vụ optimistic locking", () => {
    expect(newProduct({ version: 5 }).version).toBe(5);
  });

  it("không có version thì mặc định 0", () => {
    expect(newProduct().version).toBe(0);
  });

  it("hydrate không sinh domain event", () => {
    expect(newProduct().domainEvents).toHaveLength(0);
  });
});

describe("Product.changePrice", () => {
  it("đổi giá và raise ProductPriceChanged kèm giá cũ/mới", () => {
    const product = newProduct();

    product.changePrice(new Money(150_000));

    expect(product.price.getValue()).toBe(150_000);
    expect(product.domainEvents[0].eventName).toBe("ProductPriceChanged");
    expect(product.domainEvents[0].metadata).toEqual({
      oldPrice: 100_000,
      newPrice: 150_000,
    });
  });

  it("đặt lại đúng giá cũ là no-op, không raise event thừa", () => {
    const product = newProduct();

    product.changePrice(new Money(100_000));

    expect(product.domainEvents).toHaveLength(0);
    expect(product.version).toBe(0);
  });

  it("giá 0 vẫn hợp lệ (hàng tặng kèm)", () => {
    const product = newProduct();

    product.changePrice(new Money(0));

    expect(product.price.getValue()).toBe(0);
  });

  it("từ chối giá âm (kiểm tra phòng thủ ở tầng domain, ngoài Money)", () => {
    const product = newProduct();
    // Money tự nó đã chặn số âm ở constructor, nên để bao phủ được nhánh
    // phòng thủ "newPrice.getValue() < 0" trong Product.changePrice, ta giả
    // lập một giá trị kiểu Money có getValue() trả về số âm.
    const fakeNegativePrice = { getValue: () => -1 } as unknown as Money;

    expect(() => product.changePrice(fakeNegativePrice)).toThrow(
      InvalidPriceError,
    );
    expect(() => product.changePrice(fakeNegativePrice)).toThrow(
      "Price cannot be negative",
    );
  });
});

describe("Product.reduceStock", () => {
  it("trừ tồn kho, chưa raise event khi vẫn còn hàng", () => {
    const product = newProduct({ stock: 10 });

    product.reduceStock(3);

    expect(product.stock).toBe(7);
    expect(product.domainEvents).toHaveLength(0);
  });

  it("raise ProductStockDepleted khi tồn kho về đúng 0", () => {
    const product = newProduct({ stock: 3 });

    product.reduceStock(3);

    expect(product.stock).toBe(0);
    expect(product.domainEvents[0].eventName).toBe("ProductStockDepleted");
    expect(product.domainEvents[0].metadata).toEqual({
      productName: "Áo thun",
    });
  });

  it("trừ quá tồn kho ném InsufficientStockError kèm số liệu", () => {
    const product = newProduct({ stock: 2 });

    try {
      product.reduceStock(5);
      expect.unreachable("phải ném InsufficientStockError");
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientStockError);
      expect((error as InsufficientStockError).available).toBe(2);
      expect((error as InsufficientStockError).requested).toBe(5);
    }
    expect(product.stock).toBe(2);
  });

  it.each([0, -1])("reduceStock(%s) bị chặn vì không dương", (quantity) => {
    const product = newProduct();

    expect(() => product.reduceStock(quantity)).toThrow(
      InvalidStockQuantityError,
    );
  });
});

describe("Product.increaseStock", () => {
  it("cộng tồn kho và raise ProductRestocked với tồn kho mới", () => {
    const product = newProduct({ stock: 5 });

    product.increaseStock(10);

    expect(product.stock).toBe(15);
    expect(product.domainEvents[0].eventName).toBe("ProductRestocked");
    expect(product.domainEvents[0].metadata).toEqual({
      quantityAdded: 10,
      newStock: 15,
    });
  });

  it.each([0, -3])("increaseStock(%s) bị chặn", (quantity) => {
    const product = newProduct();

    expect(() => product.increaseStock(quantity)).toThrow(
      InvalidStockQuantityError,
    );
  });
});

describe("Product.activate / deactivate", () => {
  it("deactivate sản phẩm đang active và raise ProductDeactivated", () => {
    const product = newProduct({ isActive: true });

    product.deactivate();

    expect(product.isActive).toBe(false);
    expect(product.domainEvents[0].eventName).toBe("ProductDeactivated");
  });

  it("activate sản phẩm đang inactive và raise ProductActivated", () => {
    const product = newProduct({ isActive: false });

    product.activate();

    expect(product.isActive).toBe(true);
    expect(product.domainEvents[0].eventName).toBe("ProductActivated");
  });

  it("activate sản phẩm đã active bị chặn (idempotency ở tầng domain)", () => {
    const product = newProduct({ isActive: true });

    expect(() => product.activate()).toThrow(ProductAlreadyActiveError);
  });

  it("deactivate sản phẩm đã inactive bị chặn", () => {
    const product = newProduct({ isActive: false });

    expect(() => product.deactivate()).toThrow(ProductAlreadyInactiveError);
  });
});

describe("Product - tích luỹ event", () => {
  it("nhiều thao tác liên tiếp tích luỹ event theo đúng thứ tự", () => {
    const product = newProduct({ stock: 5, isActive: true });

    product.changePrice(new Money(200_000));
    product.reduceStock(5);
    product.deactivate();

    expect(product.domainEvents.map((e) => e.eventName)).toEqual([
      "ProductPriceChanged",
      "ProductStockDepleted",
      "ProductDeactivated",
    ]);
    expect(product.version).toBe(3);
  });
});
