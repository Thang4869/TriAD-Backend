import {
  Cart as PrismaCart,
  CartItem as PrismaCartItem,
  Product,
} from "@prisma/client";
import { Cart } from "./domain/cart.entity";

export class CartMapper {
  static toDomain(
    prismaCart: PrismaCart & {
      items: (PrismaCartItem & { product: Product })[];
    },
  ): Cart {
    return Cart.hydrate({
      id: prismaCart.id,
      userId: prismaCart.userId,
      items: prismaCart.items.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        price: item.product.price,
        quantity: item.quantity,
      })),
    });
  }

  static toPersistenceItems(cart: Cart): Array<{
    productId: string;
    quantity: number;
  }> {
    return cart.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
  }
}
