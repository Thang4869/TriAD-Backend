import type {
  OrderPlacedEvent,
  OrderStatusChangedEvent,
} from "@shared/domain/events/order-events";
import type {
  ProductPriceChangedEvent,
  ProductRestockedEvent,
  ProductStockDepletedEvent,
} from "@shared/domain/events/product-events";

export type ProductProjectionEvent =
  ProductPriceChangedEvent | ProductRestockedEvent | ProductStockDepletedEvent;

export interface ProjectionStore {
  upsertOrderPlaced(event: OrderPlacedEvent): Promise<void>;

  updateOrderStatus(event: OrderStatusChangedEvent): Promise<void>;

  upsertProduct(event: ProductProjectionEvent): Promise<void>;

  refreshDashboard(): Promise<void>;
}
