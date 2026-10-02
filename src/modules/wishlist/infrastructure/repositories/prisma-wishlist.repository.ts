import prisma from "@core/database/prisma";

import type { IWishlistRepository } from "../../application/ports/wishlist.repository.port";
import type { WishlistItemWithProduct } from "../../application/ports/wishlist-models";
import { toSafeMoneyNumber } from "@shared/infrastructure/money-number";

const PRODUCT_SUMMARY_SELECT = {
  id: true,
  name: true,
  price: true,
  images: true,
  stock: true,
  slug: true,
  isActive: true,
} as const;

// ---------- Prisma implementation ----------

export class PrismaWishlistRepository implements IWishlistRepository {
  async findByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<WishlistItemWithProduct[]> {
    const items = await prisma.wishlistItem.findMany({
      where: { userId },
      include: { product: { select: PRODUCT_SUMMARY_SELECT } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
    return items.map((item) => ({
      ...item,
      product: {
        ...item.product,
        price: toSafeMoneyNumber(item.product.price),
      },
    }));
  }

  async countByUser(userId: string): Promise<number> {
    return prisma.wishlistItem.count({ where: { userId } });
  }

  async exists(userId: string, productId: string): Promise<boolean> {
    const item = await prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId, productId } },
      select: { id: true },
    });
    return item !== null;
  }

  async productExists(productId: string): Promise<boolean> {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    return product !== null;
  }

  async create(
    userId: string,
    productId: string,
  ): Promise<WishlistItemWithProduct> {
    const item = await prisma.wishlistItem.create({
      data: { userId, productId },
      include: { product: { select: PRODUCT_SUMMARY_SELECT } },
    });
    return {
      ...item,
      product: {
        ...item.product,
        price: toSafeMoneyNumber(item.product.price),
      },
    };
  }

  async delete(userId: string, productId: string): Promise<void> {
    await prisma.wishlistItem.delete({
      where: { userId_productId: { userId, productId } },
    });
  }
}
