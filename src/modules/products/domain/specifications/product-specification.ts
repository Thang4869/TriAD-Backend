export interface ProductFilter {
  AND?: ProductFilter[];
  OR?: Array<{
    name?: { contains: string; mode: "insensitive" };
    description?: { contains: string; mode: "insensitive" };
  }>;
  isActive?: boolean;
  category?: string;
  price?: { gte?: number; lte?: number };
}

export interface ProductSpecification {
  toFilter(): ProductFilter;
  and(other: ProductSpecification): ProductSpecification;
}

abstract class BaseSpecification implements ProductSpecification {
  abstract toFilter(): ProductFilter;

  and(other: ProductSpecification): ProductSpecification {
    return new AndSpecification(this, other);
  }
}

class AndSpecification extends BaseSpecification {
  constructor(
    private readonly left: ProductSpecification,
    private readonly right: ProductSpecification,
  ) {
    super();
  }

  toFilter(): ProductFilter {
    return {
      AND: [this.left.toFilter(), this.right.toFilter()],
    };
  }
}

export class NoopSpecification extends BaseSpecification {
  toFilter(): ProductFilter {
    return {};
  }
}

export class ActiveProductSpecification extends BaseSpecification {
  constructor(private readonly isActive: boolean = true) {
    super();
  }

  toFilter(): ProductFilter {
    return { isActive: this.isActive };
  }
}

export class CategorySpecification extends BaseSpecification {
  constructor(private readonly category: string) {
    super();
  }

  toFilter(): ProductFilter {
    return { category: this.category };
  }
}

export class PriceRangeSpecification extends BaseSpecification {
  constructor(
    private readonly minPrice?: number,
    private readonly maxPrice?: number,
  ) {
    super();
  }

  toFilter(): ProductFilter {
    if (this.minPrice === undefined && this.maxPrice === undefined) return {};
    const price: ProductFilter["price"] = {};
    if (this.minPrice !== undefined) price.gte = this.minPrice;
    if (this.maxPrice !== undefined) price.lte = this.maxPrice;
    return { price };
  }
}

export class KeywordSpecification extends BaseSpecification {
  constructor(private readonly keyword: string) {
    super();
  }

  toFilter(): ProductFilter {
    return {
      OR: [
        { name: { contains: this.keyword, mode: "insensitive" } },
        { description: { contains: this.keyword, mode: "insensitive" } },
      ],
    };
  }
}

export class ProductSpecificationBuilder {
  private spec: ProductSpecification = new NoopSpecification();

  activeOnly(isActive = true): this {
    this.spec = this.spec.and(new ActiveProductSpecification(isActive));
    return this;
  }

  withIsActive(isActive?: boolean): this {
    if (isActive !== undefined) {
      this.spec = this.spec.and(new ActiveProductSpecification(isActive));
    }
    return this;
  }

  withCategory(category?: string): this {
    if (category) {
      this.spec = this.spec.and(new CategorySpecification(category));
    }
    return this;
  }

  withPriceRange(minPrice?: number, maxPrice?: number): this {
    if (minPrice !== undefined || maxPrice !== undefined) {
      this.spec = this.spec.and(
        new PriceRangeSpecification(minPrice, maxPrice),
      );
    }
    return this;
  }

  withKeyword(keyword?: string): this {
    if (keyword) {
      this.spec = this.spec.and(new KeywordSpecification(keyword));
    }
    return this;
  }

  build(): ProductSpecification {
    return this.spec;
  }
}
