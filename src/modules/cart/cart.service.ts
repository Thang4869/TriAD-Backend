import { NotFoundError, BadRequestError } from "@shared/utils/errors";
import {
  ICartRepository,
  CartWithItems,
  CartItemWithProduct,
} from "./cart.repository";

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
  ): Promise<CartItemWithProduct | void>;
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
    if (quantity <= 0) {
      throw new BadRequestError("Quantity must be greater than 0");
    }

    const product = await this.repository.findProductStockInfo(productId);
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    if (product.stock < quantity) {
      throw new BadRequestError(
        `Not enough stock. Available: ${product.stock}`,
      );
    }

    const cart = await this.getOrCreateCart(userId);

    const existingItem = await this.repository.findCartItem(cart.id, productId);

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      if (newQuantity > product.stock) {
        throw new BadRequestError(
          `Cannot add more than ${product.stock} items`,
        );
      }
      return this.repository.updateCartItemQuantity(
        existingItem.id,
        newQuantity,
      );
    }

    return this.repository.createCartItem(cart.id, productId, quantity);
  }

  async updateItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartItemWithProduct | void> {
    if (quantity < 0) {
      throw new BadRequestError("Quantity cannot be negative");
    }

    const cart = await this.repository.findCartWithItems(userId);
    if (!cart) {
      throw new NotFoundError("Cart not found");
    }

    const item = cart.items.find((i) => i.productId === productId);
    if (!item) {
      throw new NotFoundError("Item not in cart");
    }

    if (quantity === 0) {
      await this.repository.deleteCartItem(item.id);
      return;
    }

    const product = await this.repository.findProductStockInfo(productId);
    if (!product || product.stock < quantity) {
      const available = product?.stock ?? 0;
      throw new BadRequestError(`Not enough stock. Available: ${available}`);
    }

    return this.repository.updateCartItemQuantity(item.id, quantity);
  }

  async removeItem(userId: string, productId: string): Promise<void> {
    const cart = await this.repository.findCartWithItems(userId);
    if (!cart) {
      throw new NotFoundError("Cart not found");
    }

    const item = cart.items.find((i) => i.productId === productId);
    if (!item) {
      throw new NotFoundError("Item not in cart");
    }

    await this.repository.deleteCartItem(item.id);
  }

  async clearCart(userId: string): Promise<{ count: number }> {
    const cart = await this.repository.findCartByUserId(userId);
    if (!cart) {
      throw new NotFoundError("Cart not found");
    }

    const count = await this.repository.deleteCartItemsByCartId(cart.id);
    return { count };
  }

  private async getOrCreateCart(userId: string) {
    const cart = await this.repository.findCartByUserId(userId);
    if (cart) return cart;
    return this.repository.createCart(userId);
  }
}
