import { ICheckoutRepository } from "../checkout.repository";
import { CheckoutTransaction } from "../application/ports/checkout-transaction";
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from "@shared/utils/errors";
import { withSpan } from "@core/tracing/span";
import { Attributes } from "@opentelemetry/api";
import {
  stockReservationFailed,
  stockReservationSucceeded,
} from "@core/metrics/metrics.registry";

export class StockReservationService {
  constructor(private readonly repository: ICheckoutRepository) {}

  async reserveStock(
    tx: CheckoutTransaction,
    cartItems: { productId: string; quantity: number }[],
  ): Promise<void> {
    if (cartItems.length === 0) {
      throw new BadRequestError("Cart is empty");
    }
    try {
      const result = await withSpan(
        "checkout.reserve_stock",
        (setAttributes) => this.doReserveStock(tx, cartItems, setAttributes),
        { "stock.sku_count": cartItems.length },
      );
      stockReservationSucceeded.inc();
      return result;
    } catch (error) {
      stockReservationFailed.inc();
      throw error;
    }
  }

  private async doReserveStock(
    tx: CheckoutTransaction,
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
