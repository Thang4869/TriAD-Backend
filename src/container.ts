import { Container, Lifetime } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

import { PrismaProductsRepository } from "@modules/products/infrastructure/repositories/prisma-products.repository";
import { ProductsController } from "@modules/products/products.controller";

import { PrismaAuthRepository } from "@modules/auth/infrastructure/repositories/prisma-auth.repository";
import { AuthService } from "@modules/auth/auth.service";
import { AuthController } from "@modules/auth/auth.controller";

import { PrismaCartRepository } from "@modules/cart/infrastructure/repositories/prisma-cart.repository";
import { CartService } from "@modules/cart/cart.service";
import { CartController } from "@modules/cart/cart.controller";

import { PrismaCheckoutRepository } from "@modules/checkout/infrastructure/repositories/prisma-checkout.repository";
import { CheckoutService } from "@modules/checkout/checkout.service";
import { CheckoutController } from "@modules/checkout/checkout.controller";

import { PrismaOrdersRepository } from "@modules/orders/infrastructure/repositories/prisma-orders.repository";
import { PrismaOrderHistoryReadRepository } from "@modules/orders/infrastructure/repositories/prisma-order-history-read.repository";
import { OrdersService } from "@modules/orders/orders.service";
import { OrdersController } from "@modules/orders/orders.controller";

import { PrismaReviewsRepository } from "@modules/reviews/infrastructure/repositories/prisma-reviews.repository";
import { ReviewsService } from "@modules/reviews/reviews.service";
import { ReviewsController } from "@modules/reviews/reviews.controller";

import { PrismaUsersRepository } from "@modules/users/infrastructure/repositories/prisma-users.repository";
import { UsersService } from "@modules/users/users.service";
import { UsersController } from "@modules/users/users.controller";

import { PrismaWishlistRepository } from "@modules/wishlist/infrastructure/repositories/prisma-wishlist.repository";
import { WishlistService } from "@modules/wishlist/wishlist.service";
import { WishlistController } from "@modules/wishlist/wishlist.controller";

import { PrismaDashboardReadRepository } from "@modules/admin/dashboard/infrastructure/repositories/prisma-dashboard-read.repository";
import { DashboardService } from "@modules/admin/dashboard/dashboard.service";
import { DashboardController } from "@modules/admin/dashboard/dashboard.controller";

import { PrismaNotificationsRepository } from "@modules/notifications/infrastructure/repositories/prisma-notifications.repository";
import { NotificationsService } from "@modules/notifications/notifications.service";
import { NotificationsController } from "@modules/notifications/notifications.controller";

import { EmailService } from "@shared/services/email.service";
import { CloudinaryImageStorage } from "@core/storage/cloudinary";

import { EventBus } from "@shared/domain/event-bus/event-bus";
import { OrderPlacedHandler } from "@modules/checkout/event-handlers/order-placed.handler";
import { OrderStatusChangedHandler } from "@modules/orders/event-handlers/order-status-changed.handler";
import { OrderPlacedEvent } from "@shared/domain/events/order-events";
import {
  ProductPriceChangedEvent,
  ProductRestockedEvent,
  ProductStockDepletedEvent,
  ProductCreatedEvent,
  ProductUpdatedEvent,
  ProductActivatedEvent,
  ProductDeactivatedEvent,
} from "@shared/domain/events/product-events";
import { ProjectionHandler } from "@core/outbox/projection-handler";

import { PricingService } from "@modules/checkout/services/pricing.service";
import { StockReservationService } from "./modules/checkout/services/stock-reservation.service";
import { ProductImageService } from "./modules/products/services/product-image.service";
import { TokenService } from "./modules/auth/services/token.service";
import { TwoFactorService } from "./modules/auth/services/two-factor.service";
import { AdminProductService } from "./modules/products/services/admin-product.service";
import { CatalogService } from "./modules/products/services/catalog.service";
import { EnvironmentFeatureFlags } from "@core/feature-flags/environment-feature-flags";
import { RedisTokenStore } from "@modules/auth/infrastructure/token-store/redis-token-store";
import { RedisOAuthStateStore } from "@modules/auth/infrastructure/token-store/redis-oauth-state-store";
import { registerOAuthStrategies } from "@modules/auth/strategies/oauth2.strategy";
import {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
} from "@shared/middlewares/auth.middleware";
import { PrismaErrorClassifier } from "@core/database/prisma-error-classifier";
import { createErrorHandler } from "@shared/middlewares/error-handler.middleware";
import { processImage } from "@/jobs/image-process.job";
import { BullMqImageProcessingQueue } from "@modules/products/infrastructure/queue/bullmq-image-processing-queue";
import { BullMqEmailQueue } from "@shared/infrastructure/queue/bullmq-email-queue";
import { PrismaProjectionStore } from "@core/outbox/prisma-projection.store";
import { OutboxRelay } from "@core/outbox/outbox-relay";
import { PrismaOutboxRelayStore } from "@core/outbox/prisma-outbox-relay.store";
import { PrismaOutboxHandlerTracker } from "@core/outbox/outbox-handler-tracker";
import { CryptoOrderNumberGenerator } from "@modules/checkout/infrastructure/order-number-generator";
import { PrismaProductCatalogReadRepository } from "@modules/products/infrastructure/repositories/prisma-product-catalog-read.repository";
import {
  ReviewCreatedEvent,
  ReviewDeletedEvent,
} from "@shared/domain/events/review-events";
import { UserRegisteredEvent } from "@shared/domain/events/user-events";
import { registerOrderEventSubscriptions } from "@modules/orders/order-event-subscriptions";
import { PrismaCheckoutUnitOfWork } from "@modules/checkout/infrastructure/prisma-checkout-unit-of-work";
import { OpenTelemetryTracerAdapter } from "@core/observability/opentelemetry-tracer.adapter";
import { PrometheusMetricsAdapter } from "@core/observability/prometheus-metrics.adapter";

export const container = new Container();

// ---------- Cross-cutting infra ----------
container.register(TOKENS.EventBus, () => new EventBus());
container.register(TOKENS.EmailQueue, () => new BullMqEmailQueue());
container.register(TOKENS.ProjectionStore, () => new PrismaProjectionStore());
container.register(TOKENS.OutboxRelayStore, () => new PrismaOutboxRelayStore());

container.register(
  TOKENS.HandlerExecutionTracker,
  () => new PrismaOutboxHandlerTracker(),
);
container.register(
  TOKENS.OutboxRelay,
  (c) =>
    new OutboxRelay(
      c.resolve(TOKENS.OutboxRelayStore),
      c.resolve(TOKENS.HandlerExecutionTracker),
      c.resolve(TOKENS.EventBus),
    ),
);
container.register(
  TOKENS.EmailService,
  (c) => new EmailService(c.resolve(TOKENS.EmailQueue)),
);
container.register(TOKENS.ImageStorage, () => new CloudinaryImageStorage());
container.register(TOKENS.Tracer, () => new OpenTelemetryTracerAdapter());

container.register(TOKENS.Metrics, () => new PrometheusMetricsAdapter());

// ---------- Repositories ----------
container.register(
  TOKENS.ProductsRepository,
  () => new PrismaProductsRepository(),
);
container.register(
  TOKENS.ProductCatalogRead,
  () => new PrismaProductCatalogReadRepository(),
);
container.register(TOKENS.AuthRepository, () => new PrismaAuthRepository());
container.register(TOKENS.AuthSessionUser, () => new PrismaAuthRepository());

container.register(TOKENS.TokenStore, () => new RedisTokenStore());
container.register(
  TOKENS.OAuthStateStore,
  (c) => new RedisOAuthStateStore(c.resolve(TOKENS.TokenStore)),
);
container.register(TOKENS.CartRepository, () => new PrismaCartRepository());
container.register(
  TOKENS.CheckoutRepository,
  () => new PrismaCheckoutRepository(),
);
container.register(
  TOKENS.CheckoutUnitOfWork,
  () => new PrismaCheckoutUnitOfWork(),
);
container.register(TOKENS.OrdersRepository, () => new PrismaOrdersRepository());
container.register(
  TOKENS.ReviewsRepository,
  () => new PrismaReviewsRepository(),
);

container.register(
  TOKENS.OrderHistoryRead,
  () => new PrismaOrderHistoryReadRepository(),
);
container.register(TOKENS.UsersRepository, () => new PrismaUsersRepository());
container.register(
  TOKENS.WishlistRepository,
  () => new PrismaWishlistRepository(),
);
container.register(
  TOKENS.DashboardRead,
  () => new PrismaDashboardReadRepository(),
);
container.register(
  TOKENS.NotificationsRepository,
  () => new PrismaNotificationsRepository(),
);

container.register(
  TOKENS.PricingService,
  (c) => new PricingService(c.resolve(TOKENS.FeatureFlags)),
);

container.register(
  TOKENS.PersistenceErrorClassifier,
  () => new PrismaErrorClassifier(),
);

container.register(
  TOKENS.ImageProcessingQueue,
  () => new BullMqImageProcessingQueue(),
);
// ---------- Auth sub-services ----------
container.register(
  TOKENS.TokenService,
  (c) =>
    new TokenService(
      c.resolve(TOKENS.AuthRepository),
      c.resolve(TOKENS.TokenStore),
    ),
);
container.register(
  TOKENS.TwoFactorService,
  (c) =>
    new TwoFactorService(
      c.resolve(TOKENS.AuthRepository),
      c.resolve(TOKENS.TokenService),
      c.resolve(TOKENS.TokenStore),
    ),
);

// ---------- Product sub-services ----------
container.register(
  TOKENS.CatalogService,
  (c) =>
    new CatalogService(
      c.resolve(TOKENS.ProductCatalogRead),
      c.resolve(TOKENS.ProductsRepository),
    ),
);
container.register(
  TOKENS.AdminProductService,
  (c) =>
    new AdminProductService(
      c.resolve(TOKENS.ProductsRepository),
      c.resolve(TOKENS.ProductImageService),
    ),
);
container.register(
  TOKENS.ProductImageService,
  (c) =>
    new ProductImageService(
      c.resolve(TOKENS.ProductsRepository),
      c.resolve(TOKENS.ImageProcessingQueue),
    ),
);

// ---------- Checkout sub-services ----------
container.register(
  TOKENS.StockReservationService,
  (c) =>
    new StockReservationService(
      c.resolve(TOKENS.Tracer),
      c.resolve(TOKENS.Metrics),
    ),
);

container.register(
  TOKENS.OrderNumberGenerator,
  () => new CryptoOrderNumberGenerator(),
);

// ---------- Domain services ----------
container.register(
  TOKENS.AuthService,
  (c) =>
    new AuthService(
      c.resolve(TOKENS.AuthRepository),
      c.resolve(TOKENS.EmailService),
      c.resolve(TOKENS.TokenService),
      c.resolve(TOKENS.TwoFactorService),
      c.resolve(TOKENS.TokenStore),
      c.resolve(TOKENS.EventBus),
    ),
);
container.register(
  TOKENS.CartService,
  (c) => new CartService(c.resolve(TOKENS.CartRepository)),
);
container.register(
  TOKENS.CheckoutService,
  (c) =>
    new CheckoutService(
      c.resolve(TOKENS.CheckoutRepository),
      c.resolve(TOKENS.CheckoutUnitOfWork),
      c.resolve(TOKENS.PricingService),
      c.resolve(TOKENS.StockReservationService),
      c.resolve(TOKENS.OrderNumberGenerator),
      c.resolve(TOKENS.Tracer),
      c.resolve(TOKENS.Metrics),
    ),
);
container.register(
  TOKENS.OrdersService,
  (c) =>
    new OrdersService(
      c.resolve(TOKENS.OrdersRepository),
      c.resolve(TOKENS.OrderHistoryRead),
    ),
);
container.register(
  TOKENS.ReviewsService,
  (c) => new ReviewsService(c.resolve(TOKENS.ReviewsRepository), eventBus),
);
container.register(
  TOKENS.UsersService,
  (c) => new UsersService(c.resolve(TOKENS.UsersRepository)),
);
container.register(
  TOKENS.WishlistService,
  (c) => new WishlistService(c.resolve(TOKENS.WishlistRepository)),
);
container.register(
  TOKENS.DashboardService,
  (c) => new DashboardService(c.resolve(TOKENS.DashboardRead)),
);
container.register(
  TOKENS.NotificationsService,
  (c) => new NotificationsService(c.resolve(TOKENS.NotificationsRepository)),
);

// ---------- Controllers ----------
container.register(
  TOKENS.ProductsController,
  (c) =>
    new ProductsController(
      c.resolve(TOKENS.CatalogService),
      c.resolve(TOKENS.AdminProductService),
    ),
  Lifetime.Transient,
);
container.register(
  TOKENS.AuthController,
  (c) => new AuthController(c.resolve(TOKENS.AuthService)),
  Lifetime.Transient,
);
container.register(
  TOKENS.CartController,
  (c) => new CartController(c.resolve(TOKENS.CartService)),
  Lifetime.Transient,
);
container.register(
  TOKENS.CheckoutController,
  (c) => new CheckoutController(c.resolve(TOKENS.CheckoutService)),
  Lifetime.Transient,
);
container.register(
  TOKENS.OrdersController,
  (c) => new OrdersController(c.resolve(TOKENS.OrdersService)),
  Lifetime.Transient,
);
container.register(
  TOKENS.ReviewsController,
  (c) => new ReviewsController(c.resolve(TOKENS.ReviewsService)),
  Lifetime.Transient,
);
container.register(
  TOKENS.UsersController,
  (c) => new UsersController(c.resolve(TOKENS.UsersService)),
  Lifetime.Transient,
);
container.register(
  TOKENS.WishlistController,
  (c) => new WishlistController(c.resolve(TOKENS.WishlistService)),
  Lifetime.Transient,
);
container.register(
  TOKENS.DashboardController,
  (c) => new DashboardController(c.resolve(TOKENS.DashboardService)),
  Lifetime.Transient,
);
container.register(
  TOKENS.NotificationsController,
  (c) => new NotificationsController(c.resolve(TOKENS.NotificationsService)),
  Lifetime.Transient,
);

// ---------- Domain event handlers ----------
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

container.register(TOKENS.FeatureFlags, () => new EnvironmentFeatureFlags());

registerOAuthStrategies(
  container.resolve(TOKENS.AuthService),
  container.resolve(TOKENS.OAuthStateStore),
);

// ---------- Wire domain events to their handlers ----------
const eventBus = container.resolve(TOKENS.EventBus);
const orderPlacedHandler = container.resolve(TOKENS.OrderPlacedHandler);
const orderStatusChangedHandler = container.resolve(
  TOKENS.OrderStatusChangedHandler,
);
const projectionHandler = container.resolve(TOKENS.ProjectionHandler);

eventBus.subscribe(
  OrderPlacedEvent.eventName,
  "OrderPlacedHandler",
  orderPlacedHandler.handle.bind(orderPlacedHandler),
);
// Order cancellation emits both OrderStatusChanged(CANCELLED) and
// OrderCancelled. Generic lifecycle side effects belong only to
// OrderStatusChanged. OrderCancelled is intentionally reserved for
// cancellation-specific workflows and must not duplicate notification or
// order-history projection handlers.
eventBus.subscribe(
  OrderPlacedEvent.eventName,
  "OrderHistoryProjectionHandler",
  projectionHandler.handleOrderPlaced.bind(projectionHandler),
);
registerOrderEventSubscriptions(eventBus, {
  handleStatusNotification: orderStatusChangedHandler.handle.bind(
    orderStatusChangedHandler,
  ),

  handleStatusProjection:
    projectionHandler.handleOrderStatusChanged.bind(projectionHandler),
});
for (const eventName of [
  ProductCreatedEvent.eventName,
  ProductUpdatedEvent.eventName,
  ProductPriceChangedEvent.eventName,
  ProductRestockedEvent.eventName,
  ProductStockDepletedEvent.eventName,
  ProductActivatedEvent.eventName,
  ProductDeactivatedEvent.eventName,
]) {
  eventBus.subscribe(
    eventName,
    `ProductCatalogProjectionHandler:${eventName}`,
    projectionHandler.handleProductEvent.bind(projectionHandler),
  );
}
eventBus.subscribe(
  UserRegisteredEvent.eventName,
  "DashboardProjectionHandler:UserRegistered",
  projectionHandler.handleUserRegistered.bind(projectionHandler),
);
for (const eventName of [
  ReviewCreatedEvent.eventName,
  ReviewDeletedEvent.eventName,
]) {
  eventBus.subscribe(
    eventName,
    `ProductCatalogRatingProjectionHandler:${eventName}`,
    projectionHandler.handleProductRatingChanged.bind(projectionHandler),
  );
}

// ---------- Named exports ----------
export { eventBus };
export const productsController = container.resolve(TOKENS.ProductsController);
export const authController = container.resolve(TOKENS.AuthController);
export const oauthStateStore = container.resolve(TOKENS.OAuthStateStore);
export const cartController = container.resolve(TOKENS.CartController);
export const checkoutController = container.resolve(TOKENS.CheckoutController);
export const ordersController = container.resolve(TOKENS.OrdersController);
export const reviewsController = container.resolve(TOKENS.ReviewsController);
export const usersController = container.resolve(TOKENS.UsersController);
export const wishlistController = container.resolve(TOKENS.WishlistController);
export const dashboardController = container.resolve(
  TOKENS.DashboardController,
);
export const notificationsController = container.resolve(
  TOKENS.NotificationsController,
);
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
export const imageJobProcessor = (job: Parameters<typeof processImage>[0]) =>
  processImage(
    job,
    container.resolve(TOKENS.ProductsRepository),
    container.resolve(TOKENS.ImageStorage),
  );
