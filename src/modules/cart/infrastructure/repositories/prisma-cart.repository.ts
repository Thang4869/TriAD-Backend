import prisma from "@core/database/prisma";
import { Cart as PrismaCart, CartItem as PrismaCartItem } from "@prisma/client";

import type {
  AddCartItemResult,
  ICartRepository,
} from "../../application/ports/cart.repository.port";
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

  async addItemAtomically(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<AddCartItemResult> {
    return prisma.$transaction(
      async (tx) => {
        await tx.cart.createMany({ data: [{ userId }], skipDuplicates: true });
        const cart = await tx.cart.findUniqueOrThrow({
          where: { userId },
          select: { id: true },
        });

        // Match checkout's lock order: cart row, cart items, then product rows.
        await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM carts WHERE id = ${cart.id} FOR UPDATE
      `;

        const [product] = await tx.$queryRaw<
          Array<{ id: string; stock: number }>
        >`
        SELECT id, stock FROM products WHERE id = ${productId} FOR UPDATE
      `;
        if (!product) return { status: "product_not_found" as const };

        const existing = await tx.cartItem.findUnique({
          where: { cartId_productId: { cartId: cart.id, productId } },
        });
        const nextQuantity = (existing?.quantity ?? 0) + quantity;
        if (!Number.isSafeInteger(nextQuantity)) {
          return { status: "quantity_overflow" as const };
        }
        if (nextQuantity > product.stock) {
          return {
            status: "insufficient_stock" as const,
            available: product.stock,
          };
        }

        const item = existing
          ? await tx.cartItem.update({
              where: { id: existing.id },
              data: { quantity: nextQuantity },
              include: { product: true },
            })
          : await tx.cartItem.create({
              data: { cartId: cart.id, productId, quantity },
              include: { product: true },
            });
        return { status: "added" as const, item: mapCartItemWithProduct(item) };
      },
      { isolationLevel: "ReadCommitted", timeout: 10_000 },
    );
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
