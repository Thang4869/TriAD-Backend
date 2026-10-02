import prisma from "@core/database/prisma";
import { Cart as PrismaCart, CartItem as PrismaCartItem } from "@prisma/client";

import type { ICartRepository } from "../../application/ports/cart.repository.port";
import type {
  CartWithItems,
  CartItemWithProduct,
  ProductStockInfo,
} from "../../application/ports/cart-models";
import { toSafeMoneyNumber } from "@shared/infrastructure/money-number";

// ---------- Prisma implementation ----------

export class PrismaCartRepository implements ICartRepository {
  private static readonly PRODUCT_SUMMARY_SELECT = {
    id: true,
    name: true,
    price: true,
    images: true,
    stock: true,
    slug: true,
  } as const;

  async findCartWithItems(userId: string): Promise<CartWithItems | null> {
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: { select: PrismaCartRepository.PRODUCT_SUMMARY_SELECT },
          },
        },
      },
    });
    return cart ? mapCartWithItems(cart) : null;
  }

  async createCartWithItems(userId: string): Promise<CartWithItems> {
    const cart = await prisma.cart.create({
      data: { userId },
      include: {
        items: {
          include: {
            product: { select: PrismaCartRepository.PRODUCT_SUMMARY_SELECT },
          },
        },
      },
    });
    return mapCartWithItems(cart);
  }

  async findCartByUserId(userId: string): Promise<PrismaCart | null> {
    return prisma.cart.findUnique({ where: { userId } });
  }

  async createCart(userId: string): Promise<PrismaCart> {
    return prisma.cart.create({ data: { userId } });
  }

  async findProductStockInfo(
    productId: string,
  ): Promise<ProductStockInfo | null> {
    return prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, stock: true, name: true },
    });
  }

  async findCartItem(
    cartId: string,
    productId: string,
  ): Promise<PrismaCartItem | null> {
    return prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId, productId } },
    });
  }

  async createCartItem(
    cartId: string,
    productId: string,
    quantity: number,
  ): Promise<CartItemWithProduct> {
    const item = await prisma.cartItem.create({
      data: { cartId, productId, quantity },
      include: { product: true },
    });
    return mapCartItemWithProduct(item);
  }

  async updateCartItemQuantity(
    itemId: string,
    quantity: number,
  ): Promise<CartItemWithProduct> {
    const item = await prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
      include: { product: true },
    });
    return mapCartItemWithProduct(item);
  }

  async deleteCartItem(itemId: string): Promise<void> {
    await prisma.cartItem.delete({ where: { id: itemId } });
  }

  async deleteCartItemsByCartId(cartId: string): Promise<number> {
    const result = await prisma.cartItem.deleteMany({ where: { cartId } });
    return result.count;
  }
}

function mapCartWithItems(cart: {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    cartId: string;
    productId: string;
    quantity: number;
    createdAt: Date;
    updatedAt: Date;
    product: {
      id: string;
      name: string;
      price: Parameters<typeof toSafeMoneyNumber>[0];
      images: string[];
      stock: number;
      slug: string;
    };
  }>;
}): CartWithItems {
  return {
    ...cart,
    items: cart.items.map((item) => ({
      ...item,
      product: {
        ...item.product,
        price: toSafeMoneyNumber(item.product.price),
      },
    })),
  };
}

function mapCartItemWithProduct(item: {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
  product: {
    id: string;
    name: string;
    description: string | null;
    price: Parameters<typeof toSafeMoneyNumber>[0];
    stock: number;
    version: number;
    category: string;
    images: string[];
    slug: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}): CartItemWithProduct {
  return {
    ...item,
    product: {
      ...item.product,
      price: toSafeMoneyNumber(item.product.price),
    },
  };
}
