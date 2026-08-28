import prisma from "@core/database/prisma";
import { Prisma, Product } from "@prisma/client";

// ---------- Shared query/result types ----------

export interface ProductListQuery {
  where: Prisma.ProductWhereInput;
  orderBy: Prisma.ProductOrderByWithRelationInput;
  skip: number;
  take: number;
}

export type ProductWithRatingReviews = Prisma.ProductGetPayload<{
  include: { reviews: { select: { rating: true } } };
}>;

export type ProductWithFullReviews = Prisma.ProductGetPayload<{
  include: {
    reviews: {
      include: {
        user: {
          select: { id: true; firstName: true; lastName: true; email: true };
        };
      };
      orderBy: { createdAt: "desc" };
    };
  };
}>;

export type ProductWithShortReviews = Prisma.ProductGetPayload<{
  include: {
    reviews: {
      include: {
        user: { select: { id: true; firstName: true; lastName: true } };
      };
      orderBy: { createdAt: "desc" };
    };
  };
}>;

export interface CategoryCount {
  category: string;
  count: number;
}

export interface CreateProductData {
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  images: string[];
  slug: string;
}

export type UpdateProductData = Partial<CreateProductData & { isActive: boolean }>;

// ---------- Repository contract ----------

export interface IProductsRepository {
  findManyWithRatings(query: ProductListQuery): Promise<ProductWithRatingReviews[]>;
  count(where: Prisma.ProductWhereInput): Promise<number>;
  findByIdWithReviews(id: string): Promise<ProductWithFullReviews | null>;
  findBySlugWithReviews(slug: string): Promise<ProductWithShortReviews | null>;
  findBySlugId(slug: string): Promise<Pick<Product, "id"> | null>;

  groupByCategory(): Promise<CategoryCount[]>;

  findManyAdmin(query: ProductListQuery): Promise<Product[]>;
  findById(id: string): Promise<Product | null>;
  create(data: CreateProductData): Promise<Product>;

  update(id: string, data: UpdateProductData): Promise<Product>;
  setActive(id: string, isActive: boolean): Promise<Product>;
}

// ---------- Prisma implementation ----------

export class PrismaProductsRepository implements IProductsRepository {
  async findManyWithRatings(query: ProductListQuery): Promise<ProductWithRatingReviews[]> {
    return prisma.product.findMany({
      where: query.where,
      orderBy: query.orderBy,
      skip: query.skip,
      take: query.take,
      include: {
        reviews: {
          select: { rating: true },
        },
      },
    });
  }

  async count(where: Prisma.ProductWhereInput): Promise<number> {
    return prisma.product.count({ where });
  }

  async findByIdWithReviews(id: string): Promise<ProductWithFullReviews | null> {
    return prisma.product.findUnique({
      where: { id },
      include: {
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  async findBySlugWithReviews(slug: string): Promise<ProductWithShortReviews | null> {
    return prisma.product.findUnique({
      where: { slug },
      include: {
        reviews: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  async findBySlugId(slug: string): Promise<Pick<Product, "id"> | null> {
    return prisma.product.findUnique({
      where: { slug },
      select: { id: true },
    });
  }

  async groupByCategory(): Promise<CategoryCount[]> {
    const groups = await prisma.product.groupBy({
      by: ["category"],
      where: { isActive: true },
      _count: { category: true },
    });

    return groups.map((g) => ({
      category: g.category,
      count: g._count.category,
    }));
  }

  async findManyAdmin(query: ProductListQuery): Promise<Product[]> {
    return prisma.product.findMany({
      where: query.where,
      orderBy: query.orderBy,
      skip: query.skip,
      take: query.take,
    });
  }

  async findById(id: string): Promise<Product | null> {
    return prisma.product.findUnique({ where: { id } });
  }

  async create(data: CreateProductData): Promise<Product> {
    return prisma.product.create({
      data: { ...data, isActive: true },
    });
  }

  async update(id: string, data: UpdateProductData): Promise<Product> {
    return prisma.product.update({ where: { id }, data });
  }

  async setActive(id: string, isActive: boolean): Promise<Product> {
    return prisma.product.update({ where: { id }, data: { isActive } });
  }
}