import prisma from '@core/database/prisma';
import { NotFoundError, BadRequestError } from '@shared/utils/errors';

export class CartService {
  async getCart(userId: string) {
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                images: true,
                stock: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!cart) {
      return prisma.cart.create({
        data: { userId },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  images: true,
                  stock: true,
                },
              },
            },
          },
        },
      });
    }

    return cart;
  }

  async addItem(userId: string, productId: string, quantity: number) {
    if (quantity <= 0) {
      throw new BadRequestError('Quantity must be greater than 0');
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, stock: true, name: true },
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    if (product.stock < quantity) {
      throw new BadRequestError(`Not enough stock. Available: ${product.stock}`);
    }

    let cart = await prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId },
      });
    }

    const existingItem = await prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId,
        },
      },
    });

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      if (newQuantity > product.stock) {
        throw new BadRequestError(`Cannot add more than ${product.stock} items`);
      }

      return prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
        include: { product: true },
      });
    }

    return prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId,
        quantity,
      },
      include: { product: true },
    });
  }

  async updateItem(userId: string, productId: string, quantity: number) {
    if (quantity < 0) {
      throw new BadRequestError('Quantity cannot be negative');
    }

    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: { items: true },
    });

    if (!cart) {
      throw new NotFoundError('Cart not found');
    }

    const item = cart.items.find((i) => i.productId === productId);
    if (!item) {
      throw new NotFoundError('Item not in cart');
    }

    if (quantity === 0) {
      return prisma.cartItem.delete({
        where: { id: item.id },
      });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { stock: true },
    });

    if (!product || product.stock < quantity) {
      const available = product?.stock ?? 0;
      throw new BadRequestError(`Not enough stock. Available: ${available}`);
    }

    return prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity },
      include: { product: true },
    });
  }

  async removeItem(userId: string, productId: string) {
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: { items: true },
    });

    if (!cart) {
      throw new NotFoundError('Cart not found');
    }

    const item = cart.items.find((i) => i.productId === productId);
    if (!item) {
      throw new NotFoundError('Item not in cart');
    }

    return prisma.cartItem.delete({
      where: { id: item.id },
    });
  }

  async clearCart(userId: string) {
    const cart = await prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      throw new NotFoundError('Cart not found');
    }

    return prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });
  }
}