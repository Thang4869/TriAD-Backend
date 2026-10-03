import type { OrderWithItems, UserCartForCheckout } from "./checkout-models";

export interface ICheckoutRepository {
  findOrderWithItems(orderId: string): Promise<OrderWithItems | null>;

  findOrderByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<OrderWithItems | null>;

  findUserCartForCheckout(userId: string): Promise<UserCartForCheckout | null>;

  findOrdersByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<OrderWithItems[]>;

  countOrdersByUser(userId: string): Promise<number>;

  findOrderByUserAndId(
    orderId: string,
    userId: string,
  ): Promise<OrderWithItems | null>;
}
