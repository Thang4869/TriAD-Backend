import type { LockedProductRow } from "../application/ports/checkout-models";
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
import { ProductUpdatedEvent } from "@shared/domain/events/product-events";

export class StockReservationService {
  async reserveStock(
    tx: CheckoutTransaction,
    cartItems: {
      productId: string;
      quantity: number;
    }[],
  ): Promise<LockedProductRow[]> {
    if (cartItems.length === 0) {
      throw new BadRequestError("Cart is empty");
    }

    try {
      const result = await withSpan(
        "checkout.reserve_stock",
        (setAttributes) => this.doReserveStock(tx, cartItems, setAttributes),
        {
          "stock.sku_count": cartItems.length,
        },
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
    cartItems: {
      productId: string;
      quantity: number;
    }[],
    setAttributes: (attrs: Attributes) => void,
  ): Promise<LockedProductRow[]> {
    const productIds = cartItems.map((item) => item.productId);

    const lockedProducts = await tx.lockProductsForUpdate(productIds);

    const productMap = new Map(
      lockedProducts.map((product) => [product.id, product]),
    );

    setAttributes({
      "stock.locked_product_count": lockedProducts.length,
    });

    for (const item of cartItems) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestError(
          `Invalid quantity for product ${item.productId}`,
        );
      }

      const product = productMap.get(item.productId);

      if (!product) {
        throw new NotFoundError(`Product ${item.productId} not found`);
      }

      if (!product.isActive) {
        throw new BadRequestError(`Product ${product.name} is inactive`);
      }

      if (product.stock < item.quantity) {
        throw new BadRequestError(
          `Not enough stock for ${product.name}. Available: ${product.stock}`,
        );
      }
    }

    for (const item of cartItems) {
      const product = productMap.get(item.productId)!;

      const success = await tx.decrementProductStock(
        item.productId,
        product.version,
        item.quantity,
      );

      if (!success) {
        throw new ConflictError(
          `Stock conflict for product ${item.productId}. Please retry.`,
        );
      }

      await tx.persistProductEvent(
        new ProductUpdatedEvent(item.productId),
        product.version + 1,
      );
    }

    return lockedProducts;
  }
}
