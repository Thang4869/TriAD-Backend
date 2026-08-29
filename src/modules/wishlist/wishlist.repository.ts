import prisma from "@core/database/prisma";
import { Prisma, WishlistItem } from "@prisma/client";

const PRODUCT_SUMMARY_SELECT = {
  id: true,
  name: true,
  price: true,
  images: true,
  stock: true,
  slug: true,
  isActive: true,
} as const;

export type WishlistItemWithProduct = Prisma.WishlistItemGetPayload<{
  include: { product: { select: typeof PRODUCT_SUMMARY_SELECT } };
}>;

// ---------- Repository contract ----------

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

// ---------- Prisma implementation ----------

export class PrismaWishlistRepository implements IWishlistRepository {
  async findByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<WishlistItemWithProduct[]> {
    return prisma.wishlistItem.findMany({
      where: { userId },
      include: { product: { select: PRODUCT_SUMMARY_SELECT } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
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
    return prisma.wishlistItem.create({
      data: { userId, productId },
      include: { product: { select: PRODUCT_SUMMARY_SELECT } },
    });
  }

  async delete(userId: string, productId: string): Promise<void> {
    await prisma.wishlistItem.delete({
      where: { userId_productId: { userId, productId } },
    });
  }
}