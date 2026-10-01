import type {
  OrderPlacedEvent,
  OrderStatusChangedEvent,
} from "@shared/domain/events/order-events";
import type {
  ProductActivatedEvent,
  ProductCreatedEvent,
  ProductDeactivatedEvent,
  ProductPriceChangedEvent,
  ProductRestockedEvent,
  ProductStockDepletedEvent,
  ProductUpdatedEvent,
} from "@shared/domain/events/product-events";

export type ProductProjectionEvent =
  | ProductCreatedEvent
  | ProductUpdatedEvent
  | ProductPriceChangedEvent
  | ProductRestockedEvent
  | ProductStockDepletedEvent
  | ProductActivatedEvent
  | ProductDeactivatedEvent;

export interface ProjectionStore {
  upsertOrderPlaced(event: OrderPlacedEvent): Promise<void>;

  updateOrderStatus(event: OrderStatusChangedEvent): Promise<void>;

  upsertProduct(event: ProductProjectionEvent): Promise<void>;

  refreshProductRating(productId: string): Promise<void>;

  refreshDashboard(): Promise<void>;
}
