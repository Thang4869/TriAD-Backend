import type { LockedProductRow } from "../application/ports/checkout-models";
import type { CheckoutTransaction } from "../application/ports/checkout-transaction";
import {
  ResourceNotFoundError,
  ValidationError,
  ConflictError,
} from "@shared/errors/application-error";
import type {
  TracerPort,
  TraceAttributeSetter,
} from "@shared/application/observability/tracer.port";
import type { MetricsPort } from "@shared/application/observability/metrics.port";
import { ProductUpdatedEvent } from "@shared/domain/events/product-events";

export class StockReservationService {
  constructor(
    private readonly tracer: TracerPort,
    private readonly metrics: MetricsPort,
  ) {}

  async reserveStock(
    tx: CheckoutTransaction,
    cartItems: {
      productId: string;
      quantity: number;
    }[],
  ): Promise<LockedProductRow[]> {
    if (cartItems.length === 0) {
      throw new ValidationError("Cart is empty");
    }

    try {
      const result = await this.tracer.withSpan(
        "checkout.reserve_stock",
        (setAttributes) => this.doReserveStock(tx, cartItems, setAttributes),
        {
          "stock.sku_count": cartItems.length,
        },
      );

      this.metrics.increment("stock.reservation.succeeded");

      return result;
    } catch (error) {
      this.metrics.increment("stock.reservation.failed");
      throw error;
    }
  }

  private async doReserveStock(
    tx: CheckoutTransaction,
    cartItems: {
      productId: string;
      quantity: number;
    }[],
    setAttributes: TraceAttributeSetter,
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
        throw new ValidationError(
          `Invalid quantity for product ${item.productId}`,
        );
      }

      const product = productMap.get(item.productId);

      if (!product) {
        throw new ResourceNotFoundError(`Product ${item.productId} not found`);
      }

      if (!product.isActive) {
        throw new ValidationError(`Product ${product.name} is inactive`);
      }

      if (product.stock < item.quantity) {
        throw new ValidationError(
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
