import type { Product } from "../../domain/product.entity";
import type { ProductFilter } from "../../domain/specifications/product-specification";
import type {
  ProductIdRecord,
  ProductRecord,
  ProductWithFullReviews,
  ProductWithRatingReviews,
  ProductWithShortReviews,
} from "../product-models";
export type ProductCatalogSortOrder = "asc" | "desc";

export type ProductCatalogSort = Record<string, ProductCatalogSortOrder>;
export interface ProductListQuery {
  where: ProductFilter;
  orderBy: ProductCatalogSort;
  skip: number;
  take: number;
}

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

export interface FullTextSearchResult {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  category: string;
  images: string[];
  slug: string;
  rank: number;
}

export type UpdateProductData = Partial<
  CreateProductData & { isActive: boolean }
>;

export interface IProductsRepository {
  findManyWithRatings(
    query: ProductListQuery,
  ): Promise<ProductWithRatingReviews[]>;

  count(where: ProductFilter): Promise<number>;

  findByIdWithReviews(id: string): Promise<ProductWithFullReviews | null>;

  findBySlugWithReviews(slug: string): Promise<ProductWithShortReviews | null>;

  findBySlugId(slug: string): Promise<ProductIdRecord | null>;

  groupByCategory(): Promise<CategoryCount[]>;

  findManyAdmin(query: ProductListQuery): Promise<ProductRecord[]>;
  findById(id: string): Promise<ProductRecord | null>;
  create(data: CreateProductData): Promise<ProductRecord>;
  update(id: string, data: UpdateProductData): Promise<ProductRecord>;
  updateWithEvents(
    id: string,
    data: UpdateProductData,
    aggregate: Product,
  ): Promise<ProductRecord>;
  setActive(id: string, isActive: boolean): Promise<ProductRecord>;
  existsAndActive(id: string): Promise<boolean>;

  searchFullText(
    query: string,
    skip: number,
    take: number,
  ): Promise<FullTextSearchResult[]>;

  countFullTextSearch(query: string): Promise<number>;
}
