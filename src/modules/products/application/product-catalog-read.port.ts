import type { ProductListItemResponse } from "../products.mapper";
import type { ProductFilter } from "../domain/specifications/product-specification";

export type ProductCatalogSortOrder = "asc" | "desc";

export type ProductCatalogSort = Record<string, ProductCatalogSortOrder>;

export interface ProductCatalogQuery {
  where?: ProductFilter;
  orderBy?: ProductCatalogSort;
  skip?: number;
  take?: number;
}

export interface ProductCategoryCount {
  category: string;
  count: number;
}

export interface ProductCatalogReadPort {
  findMany(query: ProductCatalogQuery): Promise<ProductListItemResponse[]>;

  count(where?: ProductFilter): Promise<number>;

  groupByCategory(): Promise<ProductCategoryCount[]>;

  search(
    query: string,
    skip: number,
    take: number,
  ): Promise<ProductListItemResponse[]>;

  countSearch(query: string): Promise<number>;
}
