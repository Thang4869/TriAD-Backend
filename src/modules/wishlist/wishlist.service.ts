import { NotFoundError, BadRequestError } from "@shared/utils/errors";
import {
  PAGINATION_DEFAULTS,
  resolvePagination,
} from "@shared/constants/pagination.constant";
import {
  IWishlistRepository,
  PrismaWishlistRepository,
} from "./wishlist.repository";

export interface IWishlistService {
  getWishlist(userId: string, page?: number, limit?: number): Promise<unknown>;
  addItem(userId: string, productId: string): Promise<unknown>;
  removeItem(userId: string, productId: string): Promise<void>;
}

export class WishlistService implements IWishlistService {
  constructor(
    private readonly repository: IWishlistRepository = new PrismaWishlistRepository(),
  ) {}

  async getWishlist(
    userId: string,
    page: number = PAGINATION_DEFAULTS.DEFAULT_PAGE,
    limit: number = PAGINATION_DEFAULTS.ADMIN_PRODUCT_LIMIT,
  ) {
    const { safeLimit, skip } = resolvePagination(page, limit);

    const [items, total] = await Promise.all([
      this.repository.findByUser(userId, skip, safeLimit),
      this.repository.countByUser(userId),
    ]);

    return {
      items,
      total,
      page,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async addItem(userId: string, productId: string) {
    const productExists = await this.repository.productExists(productId);
    if (!productExists) {
      throw new NotFoundError("Product not found");
    }

    const alreadyWishlisted = await this.repository.exists(userId, productId);
    if (alreadyWishlisted) {
      throw new BadRequestError("Product already in wishlist");
    }

    return this.repository.create(userId, productId);
  }

  async removeItem(userId: string, productId: string) {
    const exists = await this.repository.exists(userId, productId);
    if (!exists) {
      throw new NotFoundError("Product not found in wishlist");
    }
    await this.repository.delete(userId, productId);
  }
}
