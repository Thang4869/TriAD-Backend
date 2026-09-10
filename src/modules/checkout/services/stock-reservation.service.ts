import { TxClient, ICheckoutRepository } from "../checkout.repository";
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from "@shared/utils/errors";
import { withSpan } from "@core/tracing/span";
import { Attributes } from "@opentelemetry/api";

export class StockReservationService {
  constructor(private readonly repository: ICheckoutRepository) {}

  async reserveStock(
    tx: TxClient,
    cartItems: { productId: string; quantity: number }[],
  ): Promise<void> {
    if (cartItems.length === 0) {
      throw new BadRequestError("Cart is empty");
    }
    return withSpan(
      "checkout.reserve_stock",
      (setAttributes) => this.doReserveStock(tx, cartItems, setAttributes),
      { "stock.sku_count": cartItems.length },
    );
  }

  private async doReserveStock(
    tx: TxClient,
    cartItems: { productId: string; quantity: number }[],
    setAttributes: (attrs: Attributes) => void,
  ): Promise<void> {
    const productIds = cartItems.map((item) => item.productId);
    const lockedProducts = await this.repository.lockProductsForUpdate(
      tx,
      productIds,
    );
    const productMap = new Map(lockedProducts.map((p) => [p.id, p]));
    setAttributes({ "stock.locked_product_count": lockedProducts.length });

    for (const item of cartItems) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new NotFoundError(`Product ${item.productId} not found`);
      }
      if (product.stock < item.quantity) {
        throw new BadRequestError(
          `Not enough stock for ${product.name}. Available: ${product.stock}`,
        );
      }
    }

    for (const item of cartItems) {
      const product = productMap.get(item.productId)!;
      const success = await this.repository.decrementProductStock(
        tx,
        item.productId,
        product.version,
        item.quantity,
      );
      if (!success) {
        throw new ConflictError(
          `Stock conflict for product ${item.productId}. Please retry.`,
        );
      }
    }
  }
}
