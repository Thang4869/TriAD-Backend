import type { LockedProductRow } from "../application/ports/checkout-models";
import type { CheckoutTransaction } from "../application/ports/checkout-transaction";
import {
  ResourceNotFoundError,
  ValidationError,
  RetryableConflictError,
} from "@shared/errors/application-error";
import type {
  TracerPort,
  TraceAttributeSetter,
} from "@shared/application/observability/tracer.port";
import type { MetricsPort } from "@shared/application/observability/metrics.port";
import { ProductUpdatedEvent } from "@shared/domain/events/product-events";
import { logger } from "@core/logger/winston";

function observeStage(
  metrics: MetricsPort,
  stage: string,
  durationMs: number,
): void {
  try {
    metrics.observe?.("checkout.stage.duration", durationMs, { stage });
  } catch {
    logger.warn("Stock reservation metrics observation failed", { stage });
  }
}

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

    const lockStartedAt = performance.now();
    let lockedProducts: LockedProductRow[];
    try {
      lockedProducts = await tx.lockProductsForUpdate(productIds);
    } finally {
      observeStage(
        this.metrics,
        "product_lock",
        performance.now() - lockStartedAt,
      );
    }

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

    const productEvents = [];
    const sourceVersions = new Map<string, number>();

    for (const item of cartItems) {
      const product = productMap.get(item.productId)!;

      const stockStartedAt = performance.now();
      let success: boolean;
      try {
        success = await tx.decrementProductStock(
          item.productId,
          product.version,
          item.quantity,
        );
      } finally {
        observeStage(
          this.metrics,
          "stock_update",
          performance.now() - stockStartedAt,
        );
      }

      if (!success) {
        throw new RetryableConflictError(
          `Stock conflict for product ${item.productId}. Please retry.`,
          "product_stock_conflict",
        );
      }

      productEvents.push(new ProductUpdatedEvent(item.productId));
      sourceVersions.set(item.productId, product.version + 1);
    }

    if (productEvents.length > 0) {
      await tx.persistProductEvents(productEvents, sourceVersions);
    }

    return lockedProducts;
  }
}
