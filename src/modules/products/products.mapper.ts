interface ProductCore {
  id: string;
  name: string;
description: string | null;  price: number;
  stock: number;
  category: string;
  images: string[];
  slug: string;
  isActive: boolean;
  avgRating: number;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
  version?: number;
  reviews?: unknown;
  [key: string]: unknown;
}

export interface ProductListItemResponse {
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

export interface ProductDetailResponse extends ProductListItemResponse {
  reviews: unknown;
}

export function toProductListItem(product: ProductCore): ProductListItemResponse {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    stock: product.stock,
    category: product.category,
    images: product.images,
    slug: product.slug,
    isActive: product.isActive,
    avgRating: product.avgRating,
    reviewCount: product.reviewCount,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export function toProductListResponse(products: ProductCore[]): ProductListItemResponse[] {
  return products.map(toProductListItem);
}

export function toProductDetailResponse(product: ProductCore): ProductDetailResponse {
  return {
    ...toProductListItem(product),
    reviews: product.reviews,
  };
}