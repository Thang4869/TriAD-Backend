export interface ProductCore {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  category: string;
  images: string[];
  slug: string;
  isActive: boolean;
  avgRating: number;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
  reviews?: unknown;
}

export type ProductListItemResponse = Omit<ProductCore, "reviews">;

export interface ProductDetailResponse extends ProductListItemResponse {
  reviews: unknown;
}

export function toProductListItem(
  product: ProductCore,
): ProductListItemResponse {
  const { reviews: _reviews, ...listItem } = product;
  return listItem;
}

export function toProductListResponse(
  products: ProductCore[],
): ProductListItemResponse[] {
  return products.map(toProductListItem);
}

export function toProductDetailResponse(
  product: ProductCore,
): ProductDetailResponse {
  return {
    ...toProductListItem(product),
    reviews: product.reviews,
  };
}
