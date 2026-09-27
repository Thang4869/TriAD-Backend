import type {
  CartItemRecord,
  CartItemWithProduct,
  CartRecord,
  CartWithItems,
  ProductStockInfo,
} from "./cart-models";

export interface ICartRepository {
  findCartWithItems(userId: string): Promise<CartWithItems | null>;
  createCartWithItems(userId: string): Promise<CartWithItems>;

  findCartByUserId(userId: string): Promise<CartRecord | null>;
  createCart(userId: string): Promise<CartRecord>;

  findProductStockInfo(productId: string): Promise<ProductStockInfo | null>;

  findCartItem(
    cartId: string,
    productId: string,
  ): Promise<CartItemRecord | null>;

  createCartItem(
    cartId: string,
    productId: string,
    quantity: number,
  ): Promise<CartItemWithProduct>;

  updateCartItemQuantity(
    itemId: string,
    quantity: number,
  ): Promise<CartItemWithProduct>;

  deleteCartItem(itemId: string): Promise<void>;
  deleteCartItemsByCartId(cartId: string): Promise<number>;
}
