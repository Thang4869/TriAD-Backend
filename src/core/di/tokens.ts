import { createToken } from "./container";
import type { IProductsRepository } from "@modules/products/application/ports/products.repository.port";
import type { IAuthRepository } from "@modules/auth/application/ports/auth.repository.port";
import type { ICartRepository } from "@modules/cart/application/ports/cart.repository.port";
import type { ICheckoutRepository } from "@modules/checkout/application/ports/checkout.repository.port";
import type { IOrdersRepository } from "@modules/orders/application/ports/orders.repository.port";
import type { OrderHistoryReadPort } from "@modules/orders/application/order-history-read.port";
import type { IReviewsRepository } from "@modules/reviews/application/ports/reviews.repository.port";
import type { IUsersRepository } from "@modules/users/application/ports/users.repository.port";
import type { IWishlistRepository } from "@modules/wishlist/application/ports/wishlist.repository.port";
import type { DashboardReadPort } from "@modules/admin/dashboard/application/dashboard-read.port";
import type { INotificationsRepository } from "@modules/notifications/application/ports/notifications.repository.port";

import type { AuthService } from "@modules/auth/auth.service";
import type { CartService } from "@modules/cart/cart.service";
import type { CheckoutService } from "@modules/checkout/checkout.service";
import type { OrdersService } from "@modules/orders/orders.service";
import type { ReviewsService } from "@modules/reviews/reviews.service";
import type { UsersService } from "@modules/users/users.service";
import type { WishlistService } from "@modules/wishlist/wishlist.service";
import type { DashboardService } from "@modules/admin/dashboard/dashboard.service";
import type { NotificationsService } from "@modules/notifications/notifications.service";
import type { EmailService } from "@shared/services/email.service";
import type { IImageStorage } from "@core/storage/cloudinary";
import type { EventBus } from "@shared/domain/event-bus/event-bus";

import type { ProductsController } from "@modules/products/products.controller";
import type { AuthController } from "@modules/auth/auth.controller";
import type { CartController } from "@modules/cart/cart.controller";
import type { CheckoutController } from "@modules/checkout/checkout.controller";
import type { OrdersController } from "@modules/orders/orders.controller";
import type { ReviewsController } from "@modules/reviews/reviews.controller";
import type { UsersController } from "@modules/users/users.controller";
import type { WishlistController } from "@modules/wishlist/wishlist.controller";
import type { DashboardController } from "@modules/admin/dashboard/dashboard.controller";
import type { NotificationsController } from "@modules/notifications/notifications.controller";
import type { OrderPlacedHandler } from "@modules/checkout/event-handlers/order-placed.handler";
import type { OrderStatusChangedHandler } from "@modules/orders/event-handlers/order-status-changed.handler";
import type { PricingService } from "@/modules/checkout/services/pricing.service";
import type { AuthSessionUserPort } from "@modules/auth/application/ports/auth-session-user.port";
import type { TokenStorePort } from "@modules/auth/application/ports/token-store.port";
import type { PersistenceErrorClassifier } from "@shared/errors/persistence-error";
import type { FeatureFlagPort } from "@shared/application/feature-flags/feature-flag.port";
import type { ImageProcessingQueuePort } from "@modules/products/application/ports/image-processing-queue.port";
import type { EmailQueuePort } from "@shared/application/ports/email-queue.port";
import type { ProjectionHandler } from "@core/outbox/projection-handler";
import type { ProjectionStore } from "@core/outbox/projection-store.port";
import type { OutboxRelayStore } from "@core/outbox/outbox-relay-store.port";
import type { HandlerExecutionTracker } from "@shared/domain/event-bus/event-bus";
import type { OutboxRelay } from "@core/outbox/outbox-relay";
import type { OrderNumberGenerator } from "@modules/checkout/application/ports/order-number-generator.port";
import type { ProductCatalogReadPort } from "@modules/products/application/product-catalog-read.port";
import { TokenService } from "@/modules/auth/services/token.service";
import { TwoFactorService } from "@/modules/auth/services/two-factor.service";
import { StockReservationService } from "@/modules/checkout/services/stock-reservation.service";
import { AdminProductService } from "@/modules/products/services/admin-product.service";
import { CatalogService } from "@/modules/products/services/catalog.service";
import { ProductImageService } from "@/modules/products/services/product-image.service";

export const TOKENS = {
  // Repositories
  ProductsRepository: createToken<IProductsRepository>("ProductsRepository"),
  ProductCatalogRead: createToken<ProductCatalogReadPort>("ProductCatalogRead"),
  AuthRepository: createToken<IAuthRepository>("AuthRepository"),
  CartRepository: createToken<ICartRepository>("CartRepository"),
  CheckoutRepository: createToken<ICheckoutRepository>("CheckoutRepository"),
  OrdersRepository: createToken<IOrdersRepository>("OrdersRepository"),
  OrderHistoryRead: createToken<OrderHistoryReadPort>("OrderHistoryRead"),
  ReviewsRepository: createToken<IReviewsRepository>("ReviewsRepository"),
  UsersRepository: createToken<IUsersRepository>("UsersRepository"),
  WishlistRepository: createToken<IWishlistRepository>("WishlistRepository"),
  DashboardRead: createToken<DashboardReadPort>("DashboardRead"),
  NotificationsRepository: createToken<INotificationsRepository>(
    "NotificationsRepository",
  ),

  // Cross-cutting infra
  EmailQueue: createToken<EmailQueuePort>("EmailQueue"),
  EmailService: createToken<EmailService>("EmailService"),
  ImageStorage: createToken<IImageStorage>("ImageStorage"),
  EventBus: createToken<EventBus>("EventBus"),
  FeatureFlags: createToken<FeatureFlagPort>("FeatureFlags"),
  ProjectionStore: createToken<ProjectionStore>("ProjectionStore"),
  OutboxRelayStore: createToken<OutboxRelayStore>("OutboxRelayStore"),
  HandlerExecutionTracker: createToken<HandlerExecutionTracker>(
    "HandlerExecutionTracker",
  ),
  OutboxRelay: createToken<OutboxRelay>("OutboxRelay"),

  // Domain services
  AuthService: createToken<AuthService>("AuthService"),
  CartService: createToken<CartService>("CartService"),
  CheckoutService: createToken<CheckoutService>("CheckoutService"),
  OrdersService: createToken<OrdersService>("OrdersService"),
  ReviewsService: createToken<ReviewsService>("ReviewsService"),
  UsersService: createToken<UsersService>("UsersService"),
  WishlistService: createToken<WishlistService>("WishlistService"),
  DashboardService: createToken<DashboardService>("DashboardService"),
  NotificationsService: createToken<NotificationsService>(
    "NotificationsService",
  ),
  PricingService: createToken<PricingService>("PricingService"),

  // Controllers
  ProductsController: createToken<ProductsController>("ProductsController"),
  AuthController: createToken<AuthController>("AuthController"),
  CartController: createToken<CartController>("CartController"),
  CheckoutController: createToken<CheckoutController>("CheckoutController"),
  OrdersController: createToken<OrdersController>("OrdersController"),
  ReviewsController: createToken<ReviewsController>("ReviewsController"),
  UsersController: createToken<UsersController>("UsersController"),
  WishlistController: createToken<WishlistController>("WishlistController"),
  DashboardController: createToken<DashboardController>("DashboardController"),
  NotificationsController: createToken<NotificationsController>(
    "NotificationsController",
  ),

  // Domain event handlers
  ProjectionHandler: createToken<ProjectionHandler>("ProjectionHandler"),
  OrderPlacedHandler: createToken<OrderPlacedHandler>("OrderPlacedHandler"),
  OrderStatusChangedHandler: createToken<OrderStatusChangedHandler>(
    "OrderStatusChangedHandler",
  ),

  // Auth
  AuthSessionUser: createToken<AuthSessionUserPort>("AuthSessionUser"),
  TokenStore: createToken<TokenStorePort>("TokenStore"),
  TokenService: createToken<TokenService>("TokenService"),
  TwoFactorService: createToken<TwoFactorService>("TwoFactorService"),

  // Products
  ImageProcessingQueue: createToken<ImageProcessingQueuePort>(
    "ImageProcessingQueue",
  ),
  CatalogService: createToken<CatalogService>("CatalogService"),
  AdminProductService: createToken<AdminProductService>("AdminProductService"),
  ProductImageService: createToken<ProductImageService>("ProductImageService"),

  // Checkout
  StockReservationService: createToken<StockReservationService>(
    "StockReservationService",
  ),
  OrderNumberGenerator: createToken<OrderNumberGenerator>(
    "OrderNumberGenerator",
  ),

  PersistenceErrorClassifier: createToken<PersistenceErrorClassifier>(
    "PersistenceErrorClassifier",
  ),
} as const;
