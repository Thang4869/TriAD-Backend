import type { IProductsRepository } from "./ports/products.repository.port";

export type ProductDetailReadPort = Pick<
  IProductsRepository,
  "findByIdWithReviews" | "findBySlugWithReviews"
>;
