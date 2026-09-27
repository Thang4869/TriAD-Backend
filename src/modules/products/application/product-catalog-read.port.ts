import type {
  IProductsRepository,
  ProductCatalogSort,
} from "./ports/products.repository.port";
import { ProductFilter } from "../domain/specifications/product-specification";

export type { ProductCatalogSort };

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

export type ProductCatalogQuery = {
  where?: ProductFilter;
  orderBy?: ProductCatalogSort;
  skip?: number;
  take?: number;
};
