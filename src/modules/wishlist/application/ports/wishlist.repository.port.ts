import type { WishlistItemWithProduct } from "./wishlist-models";

export interface IWishlistRepository {
  findByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<WishlistItemWithProduct[]>;

  countByUser(userId: string): Promise<number>;

  exists(userId: string, productId: string): Promise<boolean>;
  productExists(productId: string): Promise<boolean>;

  create(userId: string, productId: string): Promise<WishlistItemWithProduct>;

  delete(userId: string, productId: string): Promise<void>;
}
