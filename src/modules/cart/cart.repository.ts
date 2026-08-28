import prisma from "@core/database/prisma";
import { Prisma, Cart, CartItem } from "@prisma/client";

export type CartWithItems = Prisma.CartGetPayload<{
  include: {
    items: {
      include: {
        product: {
          select: {
            id: true;
            name: true;
            price: true;
            images: true;
            stock: true;
            slug: true;
          };
        };
      };
    };
  };
}>;

export type CartItemWithProduct = Prisma.CartItemGetPayload<{
  include: { product: true };
}>;

export interface ProductStockInfo {
  id: string;
  stock: number;
  name: string;
}

// ---------- Repository contract ----------

export interface ICartRepository {
  findCartWithItems(userId: string): Promise<CartWithItems | null>;
  createCartWithItems(userId: string): Promise<CartWithItems>;
  findCartByUserId(userId: string): Promise<Cart | null>;
  createCart(userId: string): Promise<Cart>;
  findProductStockInfo(productId: string): Promise<ProductStockInfo | null>;

  findCartItem(cartId: string, productId: string): Promise<CartItem | null>;
  createCartItem(cartId: string, productId: string, quantity: number): Promise<CartItemWithProduct>;
  updateCartItemQuantity(itemId: string, quantity: number): Promise<CartItemWithProduct>;
  
  deleteCartItem(itemId: string): Promise<void>;
  deleteCartItemsByCartId(cartId: string): Promise<number>;
}

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
    return prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: { select: PrismaCartRepository.PRODUCT_SUMMARY_SELECT },
          },
        },
      },
    });
  }

  async createCartWithItems(userId: string): Promise<CartWithItems> {
    return prisma.cart.create({
      data: { userId },
      include: {
        items: {
          include: {
            product: { select: PrismaCartRepository.PRODUCT_SUMMARY_SELECT },
          },
        },
      },
    });
  }

  async findCartByUserId(userId: string): Promise<Cart | null> {
    return prisma.cart.findUnique({ where: { userId } });
  }

  async createCart(userId: string): Promise<Cart> {
    return prisma.cart.create({ data: { userId } });
  }

  async findProductStockInfo(productId: string): Promise<ProductStockInfo | null> {
    return prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, stock: true, name: true },
    });
  }

  async findCartItem(cartId: string, productId: string): Promise<CartItem | null> {
    return prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId, productId } },
    });
  }

  async createCartItem(cartId: string, productId: string, quantity: number): Promise<CartItemWithProduct> {
    return prisma.cartItem.create({
      data: { cartId, productId, quantity },
      include: { product: true },
    });
  }

  async updateCartItemQuantity(itemId: string, quantity: number): Promise<CartItemWithProduct> {
    return prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
      include: { product: true },
    });
  }

  async deleteCartItem(itemId: string): Promise<void> {
    await prisma.cartItem.delete({ where: { id: itemId } });
  }

  async deleteCartItemsByCartId(cartId: string): Promise<number> {
    const result = await prisma.cartItem.deleteMany({ where: { cartId } });
    return result.count;
  }
}