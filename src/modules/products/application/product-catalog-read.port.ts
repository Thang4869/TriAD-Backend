import { Prisma } from "@prisma/client";
import { IProductsRepository } from "../products.repository";

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
  where?: Prisma.ProductWhereInput;
  orderBy?: Prisma.ProductOrderByWithRelationInput;
  skip?: number;
  take?: number;
};
