import { describe, it, expect } from "vitest";
import {
  NoopSpecification,
  ActiveProductSpecification,
  CategorySpecification,
  PriceRangeSpecification,
  KeywordSpecification,
  ProductSpecificationBuilder,
} from "@modules/products/domain/specifications/product-specification";

describe("Specification đơn lẻ", () => {
  it("NoopSpecification không thêm điều kiện nào", () => {
    expect(new NoopSpecification().toFilter()).toEqual({});
  });

  it("ActiveProductSpecification mặc định lọc isActive = true", () => {
    expect(new ActiveProductSpecification().toFilter()).toEqual({
      isActive: true,
    });
  });

  it("ActiveProductSpecification(false) lọc sản phẩm đã ẩn", () => {
    expect(new ActiveProductSpecification(false).toFilter()).toEqual({
      isActive: false,
    });
  });

  it("CategorySpecification lọc theo đúng category", () => {
    expect(new CategorySpecification("ao").toFilter()).toEqual({
      category: "ao",
    });
  });

  it("KeywordSpecification tìm trong cả name và description, không phân biệt hoa thường", () => {
    expect(new KeywordSpecification("áo").toFilter()).toEqual({
      OR: [
        { name: { contains: "áo", mode: "insensitive" } },
        { description: { contains: "áo", mode: "insensitive" } },
      ],
    });
  });
});

describe("PriceRangeSpecification", () => {
  it("cả min và max cho ra khoảng gte/lte", () => {
    expect(new PriceRangeSpecification(10, 100).toFilter()).toEqual({
      price: { gte: 10, lte: 100 },
    });
  });

  it("chỉ có min thì chỉ sinh gte", () => {
    expect(new PriceRangeSpecification(10).toFilter()).toEqual({
      price: { gte: 10 },
    });
  });

  it("chỉ có max thì chỉ sinh lte", () => {
    expect(new PriceRangeSpecification(undefined, 100).toFilter()).toEqual({
      price: { lte: 100 },
    });
  });

  it("không có min lẫn max thì không thêm điều kiện", () => {
    expect(new PriceRangeSpecification().toFilter()).toEqual({});
  });

  it("min = 0 vẫn được giữ (không bị coi là falsy)", () => {
    expect(new PriceRangeSpecification(0).toFilter()).toEqual({
      price: { gte: 0 },
    });
  });
});

describe("Kết hợp bằng and()", () => {
  it("and() lồng hai điều kiện vào mảng AND", () => {
    const spec = new ActiveProductSpecification().and(
      new CategorySpecification("ao"),
    );

    expect(spec.toFilter()).toEqual({
      AND: [{ isActive: true }, { category: "ao" }],
    });
  });

  it("and() nhiều lần lồng nhau theo thứ tự trái sang phải", () => {
    const spec = new ActiveProductSpecification()
      .and(new CategorySpecification("ao"))
      .and(new PriceRangeSpecification(10));

    expect(spec.toFilter()).toEqual({
      AND: [
        { AND: [{ isActive: true }, { category: "ao" }] },
        { price: { gte: 10 } },
      ],
    });
  });
});

describe("ProductSpecificationBuilder", () => {
  it("builder rỗng trả về where không điều kiện", () => {
    expect(new ProductSpecificationBuilder().build().toFilter()).toEqual({});
  });

  it("activeOnly() luôn thêm điều kiện isActive", () => {
    expect(
      new ProductSpecificationBuilder().activeOnly().build().toFilter(),
    ).toEqual({ AND: [{}, { isActive: true }] });
  });

  it("withIsActive(undefined) bỏ qua điều kiện (dùng cho trang admin xem tất cả)", () => {
    expect(
      new ProductSpecificationBuilder()
        .withIsActive(undefined)
        .build()
        .toFilter(),
    ).toEqual({});
  });

  it("withIsActive(false) vẫn thêm điều kiện dù là giá trị falsy", () => {
    expect(
      new ProductSpecificationBuilder().withIsActive(false).build().toFilter(),
    ).toEqual({ AND: [{}, { isActive: false }] });
  });

  it.each([
    [
      "withCategory",
      (b: ProductSpecificationBuilder) => b.withCategory(undefined),
    ],
    [
      "withKeyword",
      (b: ProductSpecificationBuilder) => b.withKeyword(undefined),
    ],
    [
      "withCategory rỗng",
      (b: ProductSpecificationBuilder) => b.withCategory(""),
    ],
    ["withKeyword rỗng", (b: ProductSpecificationBuilder) => b.withKeyword("")],
    [
      "withPriceRange rỗng",
      (b: ProductSpecificationBuilder) =>
        b.withPriceRange(undefined, undefined),
    ],
  ])("%s không thêm điều kiện thừa", (_name, apply) => {
    const builder = apply(new ProductSpecificationBuilder());

    expect(builder.build().toFilter()).toEqual({});
  });

  it("mọi filter được áp dụng cùng lúc", () => {
    const where = new ProductSpecificationBuilder()
      .activeOnly()
      .withCategory("ao")
      .withPriceRange(10, 100)
      .withKeyword("thun")
      .build()
      .toFilter();

    const serialized = JSON.stringify(where);
    expect(serialized).toContain('"isActive":true');
    expect(serialized).toContain('"category":"ao"');
    expect(serialized).toContain('"gte":10');
    expect(serialized).toContain('"lte":100');
    expect(serialized).toContain('"contains":"thun"');
  });

  it("các phương thức with* trả về this để chain", () => {
    const builder = new ProductSpecificationBuilder();

    expect(builder.activeOnly()).toBe(builder);
    expect(builder.withCategory("ao")).toBe(builder);
    expect(builder.withKeyword("x")).toBe(builder);
    expect(builder.withPriceRange(1)).toBe(builder);
    expect(builder.withIsActive(true)).toBe(builder);
  });
});
