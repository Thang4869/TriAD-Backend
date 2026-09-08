import { Container, Lifetime } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

import { PrismaProductsRepository } from "@modules/products/products.repository";
import { ProductsService } from "@modules/products/products.service";
import { ProductsController } from "@modules/products/products.controller";

import { PrismaAuthRepository } from "@modules/auth/auth.repository";
import { AuthService } from "@modules/auth/auth.service";
import { AuthController } from "@modules/auth/auth.controller";

import { PrismaCartRepository } from "@modules/cart/cart.repository";
import { CartService } from "@modules/cart/cart.service";
import { CartController } from "@modules/cart/cart.controller";

import { PrismaCheckoutRepository } from "@modules/checkout/checkout.repository";
import { CheckoutService } from "@modules/checkout/checkout.service";
import { CheckoutController } from "@modules/checkout/checkout.controller";

import { PrismaOrdersRepository } from "@modules/orders/orders.repository";
import { OrdersService } from "@modules/orders/orders.service";
import { OrdersController } from "@modules/orders/orders.controller";

import { PrismaReviewsRepository } from "@modules/reviews/reviews.repository";
import { ReviewsService } from "@modules/reviews/reviews.service";
import { ReviewsController } from "@modules/reviews/reviews.controller";

import { PrismaUsersRepository } from "@modules/users/users.repository";
import { UsersService } from "@modules/users/users.service";
import { UsersController } from "@modules/users/users.controller";

import { PrismaWishlistRepository } from "@modules/wishlist/wishlist.repository";
import { WishlistService } from "@modules/wishlist/wishlist.service";
import { WishlistController } from "@modules/wishlist/wishlist.controller";

import { PrismaDashboardRepository } from "@modules/admin/dashboard/dashboard.repository";
import { DashboardService } from "@modules/admin/dashboard/dashboard.service";
import { DashboardController } from "@modules/admin/dashboard/dashboard.controller";

import { PrismaNotificationsRepository } from "@modules/notifications/notifications.repository";
import { NotificationsService } from "@modules/notifications/notifications.service";
import { NotificationsController } from "@modules/notifications/notifications.controller";

import { EmailService } from "@shared/services/email.service";
import { CloudinaryImageStorage } from "@core/storage/cloudinary";

import { EventBus } from "@shared/domain/event-bus/event-bus";
import { OrderPlacedHandler } from "@modules/checkout/event-handlers/order-placed.handler";
import { OrderStatusChangedHandler } from "@modules/orders/event-handlers/order-status-changed.handler";
import { OrderPlacedEvent } from "@shared/domain/events/order-events";
import { OrderStatusChangedEvent } from "@shared/domain/events/order-events";

import { PricingService } from "@modules/checkout/domain/pricing.service";
import { IdempotencyService } from "./modules/checkout/services/idempotency.service";
import { StockReservationService } from "./modules/checkout/services/stock-reservation.service";
import { ProductImageService } from "./modules/products/services/product-image.service";
import { TokenService } from "./modules/auth/services/token.service";
import { TwoFactorService } from "./modules/auth/services/two-factor.service";
import { AdminProductService } from "./modules/products/services/admin-product.service";
import { CatalogService } from "./modules/products/services/catalog.service";

export const container = new Container();

// ---------- Cross-cutting infra ----------
container.register(TOKENS.EventBus, () => EventBus.getInstance());
container.register(TOKENS.EmailService, () => new EmailService());
container.register(TOKENS.ImageStorage, () => new CloudinaryImageStorage());

// ---------- Repositories ----------
container.register(
  TOKENS.ProductsRepository,
  () => new PrismaProductsRepository(),
);
container.register(TOKENS.AuthRepository, () => new PrismaAuthRepository());
container.register(TOKENS.CartRepository, () => new PrismaCartRepository());
container.register(
  TOKENS.CheckoutRepository,
  () => new PrismaCheckoutRepository(),
);
container.register(TOKENS.OrdersRepository, () => new PrismaOrdersRepository());
container.register(
  TOKENS.ReviewsRepository,
  () => new PrismaReviewsRepository(),
);
container.register(TOKENS.UsersRepository, () => new PrismaUsersRepository());
container.register(
  TOKENS.WishlistRepository,
  () => new PrismaWishlistRepository(),
);
container.register(
  TOKENS.DashboardRepository,
  () => new PrismaDashboardRepository(),
);
container.register(
  TOKENS.NotificationsRepository,
  () => new PrismaNotificationsRepository(),
);

container.register(
  TOKENS.PricingService,
  (c) => new PricingService(c.resolve(TOKENS.CheckoutRepository)),
);

// ---------- Auth sub-services ----------
container.register(
  TOKENS.TokenService,
  (c) => new TokenService(c.resolve(TOKENS.AuthRepository)),
);
container.register(
  TOKENS.TwoFactorService,
  (c) =>
    new TwoFactorService(
      c.resolve(TOKENS.AuthRepository),
      c.resolve(TOKENS.TokenService),
    ),
);

// ---------- Product sub-services ----------
container.register(
  TOKENS.CatalogService,
  (c) => new CatalogService(c.resolve(TOKENS.ProductsRepository)),
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
  (c) => new ProductImageService(c.resolve(TOKENS.ProductsRepository)),
);

// ---------- Checkout sub-services ----------
container.register(
  TOKENS.StockReservationService,
  (c) => new StockReservationService(c.resolve(TOKENS.CheckoutRepository)),
);
container.register(
  TOKENS.IdempotencyService,
  (c) => new IdempotencyService(c.resolve(TOKENS.CheckoutRepository)),
);

// ---------- Domain services ----------
container.register(
  TOKENS.ProductsService,
  (c) => new ProductsService(c.resolve(TOKENS.ProductsRepository)),
);
container.register(
  TOKENS.AuthService,
  (c) =>
    new AuthService(
      c.resolve(TOKENS.AuthRepository),
      c.resolve(TOKENS.EmailService),
      c.resolve(TOKENS.TokenService),
      c.resolve(TOKENS.TwoFactorService),
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
      c.resolve(TOKENS.PricingService),
      c.resolve(TOKENS.StockReservationService),
      c.resolve(TOKENS.IdempotencyService),
    ),
);
container.register(
  TOKENS.OrdersService,
  (c) => new OrdersService(c.resolve(TOKENS.OrdersRepository)),
);
container.register(
  TOKENS.ReviewsService,
  (c) => new ReviewsService(c.resolve(TOKENS.ReviewsRepository)),
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
  (c) => new DashboardService(c.resolve(TOKENS.DashboardRepository)),
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
  TOKENS.OrderPlacedHandler,
  (c) => new OrderPlacedHandler(c.resolve(TOKENS.EmailService)),
);
container.register(
  TOKENS.OrderStatusChangedHandler,
  (c) => new OrderStatusChangedHandler(c.resolve(TOKENS.NotificationsService)),
);

// ---------- Wire domain events to their handlers ----------
const eventBus = container.resolve(TOKENS.EventBus);
const orderPlacedHandler = container.resolve(TOKENS.OrderPlacedHandler);
const orderStatusChangedHandler = container.resolve(
  TOKENS.OrderStatusChangedHandler,
);

eventBus.subscribe(
  OrderPlacedEvent.eventName,
  orderPlacedHandler.handle.bind(orderPlacedHandler),
);
eventBus.subscribe(
  OrderStatusChangedEvent.eventName,
  orderStatusChangedHandler.handle.bind(orderStatusChangedHandler),
);

// ---------- Named exports ----------
export { eventBus };
export const productsController = container.resolve(TOKENS.ProductsController);
export const authController = container.resolve(TOKENS.AuthController);
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
