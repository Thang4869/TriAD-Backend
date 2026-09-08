import { ICheckoutRepository, OrderWithItems } from "../checkout.repository";

export class IdempotencyService {
  constructor(private readonly repository: ICheckoutRepository) {}

  async tryReturnIdempotentOrder(
    idempotencyKey: string,
  ): Promise<{ order: OrderWithItems; idempotent: boolean } | null> {
    if (!idempotencyKey) return null;
    const cachedOrderId =
      await this.repository.findCachedOrderId(idempotencyKey);
    if (!cachedOrderId) return null;
    const order = await this.repository.findOrderWithItems(cachedOrderId);
    return order ? { order, idempotent: true } : null;
  }

  async cacheOrderId(idempotencyKey: string, orderId: string): Promise<void> {
    const ttl = parseInt(process.env.IDEMPOTENCY_TTL || "86400", 10);
    await this.repository.cacheOrderId(idempotencyKey, orderId, ttl);
  }
}
