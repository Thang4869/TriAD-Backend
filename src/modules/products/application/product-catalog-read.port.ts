import { IProductsRepository } from "../products.repository";
import { ProductFilter } from "../domain/specifications/product-specification";

export type ProductCatalogReadPort = Pick<
  IProductsRepository,
  | "findManyWithRatings"
  | "count"
  | "findByIdWithReviews"
  | "findBySlugWithReviews"
  | "groupByCategory"
  | "searchFullText"
  | "countFullTextSearch"
>;

export type ProductCatalogSortOrder = "asc" | "desc";

export type ProductCatalogSort = Record<string, ProductCatalogSortOrder>;

export type ProductCatalogQuery = {
  where?: ProductFilter;
  orderBy?: ProductCatalogSort;
  skip?: number;
  take?: number;
};
