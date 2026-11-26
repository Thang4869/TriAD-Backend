import {
  ResourceNotFoundError,
  ValidationError,
} from "@shared/errors/application-error";
import type { ICartRepository } from "./application/ports/cart.repository.port";
import {
  CartWithItems,
  CartItemWithProduct,
} from "./application/ports/cart-models";

export interface ICartService {
  getCart(userId: string): Promise<CartWithItems>;
  addItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartItemWithProduct>;
  updateItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartItemWithProduct | null>;
  removeItem(userId: string, productId: string): Promise<void>;
  clearCart(userId: string): Promise<{ count: number }>;
}

export class CartService implements ICartService {
  constructor(private readonly repository: ICartRepository) {}

  async getCart(userId: string): Promise<CartWithItems> {
    const cart = await this.repository.findCartWithItems(userId);
    if (cart) {
      return cart;
    }
    return this.repository.createCartWithItems(userId);
  }

  async addItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartItemWithProduct> {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new ValidationError("Quantity must be a positive safe integer");
    }

    const result = await this.repository.addItemAtomically(
      userId,
      productId,
      quantity,
    );

    switch (result.status) {
      case "added":
        return result.item;
      case "product_not_found":
        throw new ResourceNotFoundError("Product not found");
      case "insufficient_stock":
        throw new ValidationError(
          `Not enough stock. Available: ${result.available}`,
        );
      case "quantity_overflow":
        throw new ValidationError("Cart quantity exceeds safe integer range");
    }
  }

  async updateItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartItemWithProduct | null> {
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      throw new ValidationError("Quantity must be a non-negative safe integer");
    }

    const cart = await this.repository.findCartWithItems(userId);
    if (!cart) {
      throw new ResourceNotFoundError("Cart not found");
    }

    const item = cart.items.find((i) => i.productId === productId);
    if (!item) {
      throw new ResourceNotFoundError("Item not in cart");
    }

    if (quantity === 0) {
      await this.repository.deleteCartItem(item.id);
      return null;
    }

    const product = await this.repository.findProductStockInfo(productId);
    if (!product || product.stock < quantity) {
      const available = product?.stock ?? 0;
      throw new ValidationError(`Not enough stock. Available: ${available}`);
    }

    return this.repository.updateCartItemQuantity(item.id, quantity);
  }

  async removeItem(userId: string, productId: string): Promise<void> {
    const cart = await this.repository.findCartWithItems(userId);
    if (!cart) {
      throw new ResourceNotFoundError("Cart not found");
    }

    const item = cart.items.find((i) => i.productId === productId);
    if (!item) {
      throw new ResourceNotFoundError("Item not in cart");
    }

    await this.repository.deleteCartItem(item.id);
  }

  async clearCart(userId: string): Promise<{ count: number }> {
    const cart = await this.repository.findCartByUserId(userId);
    if (!cart) {
      throw new ResourceNotFoundError("Cart not found");
    }

    const count = await this.repository.deleteCartItemsByCartId(cart.id);
    return { count };
  }
}
