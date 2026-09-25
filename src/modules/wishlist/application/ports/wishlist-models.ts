export interface WishlistProductSummary {
  id: string;
  name: string;
  price: number;
  images: string[];
  stock: number;
  slug: string;
  isActive: boolean;
}

export interface WishlistItemWithProduct {
  id: string;
  userId: string;
  productId: string;
  createdAt: Date;
  product: WishlistProductSummary;
}
