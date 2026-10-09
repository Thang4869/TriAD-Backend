import { Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

// Composition roots
import { registerCoreInfrastructure } from "@/composition/register-core-infrastructure";
import { registerAuthModule } from "@/composition/register-auth";
import { registerProductsModule } from "@/composition/register-products";
import { registerCartModule } from "@/composition/register-cart";
import { registerCheckoutModule } from "@/composition/register-checkout";
import { registerOrdersModule } from "@/composition/register-orders";
import { registerReviewsModule } from "@/composition/register-reviews";
import { registerUsersModule } from "@/composition/register-users";
import { registerWishlistModule } from "@/composition/register-wishlist";
import { registerNotificationsModule } from "@/composition/register-notifications";
import { registerDashboardModule } from "@/composition/register-dashboard";

// Domain-event handlers
import { ProjectionHandler } from "@core/outbox/projection-handler";
import { OrderPlacedHandler } from "@modules/checkout/event-handlers/order-placed.handler";
import { OrderStatusChangedHandler } from "@modules/orders/event-handlers/order-status-changed.handler";
import { registerOrderEventSubscriptions } from "@modules/orders/order-event-subscriptions";

// Domain events
import { OrderPlacedEvent } from "@shared/domain/events/order-events";
import {
  ProductCreatedEvent,
  ProductUpdatedEvent,
  ProductPriceChangedEvent,
  ProductRestockedEvent,
  ProductStockDepletedEvent,
  ProductActivatedEvent,
  ProductDeactivatedEvent,
} from "@shared/domain/events/product-events";
import {
  ReviewCreatedEvent,
  ReviewDeletedEvent,
} from "@shared/domain/events/review-events";
import { UserRegisteredEvent } from "@shared/domain/events/user-events";

// HTTP middleware factories
import {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
} from "@shared/middlewares/auth.middleware";
import { createErrorHandler } from "@shared/middlewares/error-handler.middleware";

// Background jobs
import { processImage } from "@/jobs/image-process.job";

// 1. Root DI container

export const container = new Container();

// 2. Infrastructure registration

registerCoreInfrastructure(container);

// 3. Business module registration

registerAuthModule(container);
registerProductsModule(container);
registerCartModule(container);
registerCheckoutModule(container);
registerOrdersModule(container);
registerReviewsModule(container);
registerUsersModule(container);
registerWishlistModule(container);
registerNotificationsModule(container);
registerDashboardModule(container);

// 4. Domain-event handler registration

container.register(
  TOKENS.ProjectionHandler,
  (c) => new ProjectionHandler(c.resolve(TOKENS.ProjectionStore)),
);

container.register(
  TOKENS.OrderPlacedHandler,
  (c) => new OrderPlacedHandler(c.resolve(TOKENS.EmailService)),
);

container.register(
  TOKENS.OrderStatusChangedHandler,
  (c) => new OrderStatusChangedHandler(c.resolve(TOKENS.NotificationsService)),
);

// 5. Domain-event subscriptions

const eventBus = container.resolve(TOKENS.EventBus);

const orderPlacedHandler = container.resolve(TOKENS.OrderPlacedHandler);

const orderStatusChangedHandler = container.resolve(
  TOKENS.OrderStatusChangedHandler,
);

const projectionHandler = container.resolve(TOKENS.ProjectionHandler);

// Order placed: notification/email side effects
eventBus.subscribe(
  OrderPlacedEvent.eventName,
  "OrderPlacedHandler",
  orderPlacedHandler.handle.bind(orderPlacedHandler),
);

// Order placed: order-history and dashboard projections
eventBus.subscribe(
  OrderPlacedEvent.eventName,
  "OrderHistoryProjectionHandler",
  projectionHandler.handleOrderPlaced.bind(projectionHandler),
);

// Order lifecycle subscriptions
//
// Cancellation emits OrderStatusChanged(CANCELLED) and
// OrderCancelled. Generic lifecycle side effects belong only
// to OrderStatusChanged, preventing duplicate processing.
registerOrderEventSubscriptions(eventBus, {
  handleStatusNotification: orderStatusChangedHandler.handle.bind(
    orderStatusChangedHandler,
  ),

  handleStatusProjection:
    projectionHandler.handleOrderStatusChanged.bind(projectionHandler),
});

// Product catalog projections
const productProjectionEvents = [
  ProductCreatedEvent.eventName,
  ProductUpdatedEvent.eventName,
  ProductPriceChangedEvent.eventName,
  ProductRestockedEvent.eventName,
  ProductStockDepletedEvent.eventName,
  ProductActivatedEvent.eventName,
  ProductDeactivatedEvent.eventName,
] as const;

for (const eventName of productProjectionEvents) {
  eventBus.subscribe(
    eventName,
    `ProductCatalogProjectionHandler:${eventName}`,
    projectionHandler.handleProductEvent.bind(projectionHandler),
  );
}

// User registration: dashboard projection
eventBus.subscribe(
  UserRegisteredEvent.eventName,
  "DashboardProjectionHandler:UserRegistered",
  projectionHandler.handleUserRegistered.bind(projectionHandler),
);

// Review changes: product-rating projections
const reviewProjectionEvents = [
  ReviewCreatedEvent.eventName,
  ReviewDeletedEvent.eventName,
] as const;

for (const eventName of reviewProjectionEvents) {
  eventBus.subscribe(
    eventName,
    `ProductCatalogRatingProjectionHandler:${eventName}`,
    projectionHandler.handleProductRatingChanged.bind(projectionHandler),
  );
}

// 6. Shared domain-event bus

export { eventBus };

// 7. HTTP controllers

export const authController = container.resolve(TOKENS.AuthController);

export const productsController = container.resolve(TOKENS.ProductsController);

export const cartController = container.resolve(TOKENS.CartController);

export const checkoutController = container.resolve(TOKENS.CheckoutController);

export const ordersController = container.resolve(TOKENS.OrdersController);

export const reviewsController = container.resolve(TOKENS.ReviewsController);

export const usersController = container.resolve(TOKENS.UsersController);

export const wishlistController = container.resolve(TOKENS.WishlistController);

export const notificationsController = container.resolve(
  TOKENS.NotificationsController,
);

export const dashboardController = container.resolve(
  TOKENS.DashboardController,
);

// 8. Authentication and HTTP middleware

export const oauthStateStore = container.resolve(TOKENS.OAuthStateStore);

export const authMiddleware = createAuthMiddleware(
  container.resolve(TOKENS.AuthSessionUser),
  container.resolve(TOKENS.TokenService),
);

export const optionalAuthMiddleware = createOptionalAuthMiddleware(
  container.resolve(TOKENS.AuthSessionUser),
  container.resolve(TOKENS.TokenService),
);

export const errorHandler = createErrorHandler(
  container.resolve(TOKENS.PersistenceErrorClassifier),
);

// 9. Background job processors

export const imageJobProcessor = (job: Parameters<typeof processImage>[0]) =>
  processImage(
    job,
    container.resolve(TOKENS.ProductsRepository),
    container.resolve(TOKENS.ImageStorage),
  );
