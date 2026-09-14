export interface ReviewSummary {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  };
}

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
}

export type ProductListItemResponse = ProductCore;

export interface ProductDetailResponse extends ProductCore {
  reviews: ReviewSummary[];
}

export function toProductListItem<
  T extends ProductCore & { reviews?: unknown },
>(product: T): ProductListItemResponse {
  const { reviews: _reviews, ...listItem } = product;
  return listItem;
}

export function toProductListResponse<
  T extends ProductCore & { reviews?: unknown },
>(products: T[]): ProductListItemResponse[] {
  return products.map(toProductListItem);
}

export function toProductDetailResponse(
  product: ProductCore & { reviews: ReviewSummary[] },
): ProductDetailResponse {
  return {
    ...toProductListItem(product),
    reviews: product.reviews,
  };
}
