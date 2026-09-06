import { Prisma } from "@prisma/client";

export interface ProductSpecification {
  toPrismaWhere(): Prisma.ProductWhereInput;
  and(other: ProductSpecification): ProductSpecification;
}

abstract class BaseSpecification implements ProductSpecification {
  abstract toPrismaWhere(): Prisma.ProductWhereInput;

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

  toPrismaWhere(): Prisma.ProductWhereInput {
    return {
      AND: [this.left.toPrismaWhere(), this.right.toPrismaWhere()],
    };
  }
}

export class NoopSpecification extends BaseSpecification {
  toPrismaWhere(): Prisma.ProductWhereInput {
    return {};
  }
}

export class ActiveProductSpecification extends BaseSpecification {
  constructor(private readonly isActive: boolean = true) {
    super();
  }

  toPrismaWhere(): Prisma.ProductWhereInput {
    return { isActive: this.isActive };
  }
}

export class CategorySpecification extends BaseSpecification {
  constructor(private readonly category: string) {
    super();
  }

  toPrismaWhere(): Prisma.ProductWhereInput {
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

  toPrismaWhere(): Prisma.ProductWhereInput {
    if (this.minPrice === undefined && this.maxPrice === undefined) return {};
    const price: Prisma.ProductWhereInput["price"] = {};
    if (this.minPrice !== undefined) price.gte = this.minPrice;
    if (this.maxPrice !== undefined) price.lte = this.maxPrice;
    return { price };
  }
}

export class KeywordSpecification extends BaseSpecification {
  constructor(private readonly keyword: string) {
    super();
  }

  toPrismaWhere(): Prisma.ProductWhereInput {
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
