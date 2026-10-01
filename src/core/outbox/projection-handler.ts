import type {
  OrderPlacedEvent,
  OrderStatusChangedEvent,
} from "@shared/domain/events/order-events";
import type { UserRegisteredEvent } from "@shared/domain/events/user-events";
import type { DomainEvent } from "@shared/domain/events/domain-event";
import { withSpan } from "@core/tracing/span";
import { projectionLagSeconds } from "@core/metrics/metrics.registry";
import type {
  ProjectionStore,
  ProductProjectionEvent,
} from "./projection-store.port";

export class ProjectionHandler {
  constructor(private readonly store: ProjectionStore) {}

  async handleOrderPlaced(event: OrderPlacedEvent): Promise<void> {
    await withSpan("projection.order_history.order_placed", async () => {
      await this.store.upsertOrderPlaced(event);
      await this.store.refreshDashboard();
    });

    this.recordLag("order_history", event);
  }

  async handleProductRatingChanged(
    event: DomainEvent & { productId: string },
  ): Promise<void> {
    await withSpan("projection.product_catalog.rating_changed", () =>
      this.store.refreshProductRating(event.productId),
    );

    this.recordLag("product_catalog", event);
  }

  async handleOrderStatusChanged(
    event: OrderStatusChangedEvent,
  ): Promise<void> {
    await withSpan("projection.order_history.status_changed", async () => {
      await this.store.updateOrderStatus(event);
      await this.store.refreshDashboard();
    });

    this.recordLag("order_history", event);
  }

  async handleProductEvent(event: ProductProjectionEvent): Promise<void> {
    await withSpan("projection.product_catalog.update", async () => {
      await this.store.upsertProduct(event);
      await this.store.refreshDashboard();
    });

    this.recordLag("product_catalog", event);
  }

  async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
    await withSpan("projection.dashboard.user_registered", () =>
      this.store.refreshDashboard(),
    );

    this.recordLag("dashboard", event);
  }

  private recordLag(projection: string, event: DomainEvent): void {
    projectionLagSeconds.set(
      { projection },
      Math.max(0, (Date.now() - event.occurredAt.getTime()) / 1000),
    );
  }
}
