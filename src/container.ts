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

import { EventBus } from "@shared/domain/event-bus/event-bus";
import { OrderPlacedHandler } from "@modules/checkout/event-handlers/order-placed.handler";
import { OrderStatusChangedHandler } from "@modules/orders/event-handlers/order-status-changed.handler";
import { OrderPlacedEvent } from "@shared/domain/events/order-events";
import { OrderStatusChangedEvent } from "@shared/domain/events/order-events";

const eventBus = EventBus.getInstance();

// ---------- Repositories ----------
const productsRepository = new PrismaProductsRepository();
const authRepository = new PrismaAuthRepository();
const cartRepository = new PrismaCartRepository();
const checkoutRepository = new PrismaCheckoutRepository();
const ordersRepository = new PrismaOrdersRepository();
const reviewsRepository = new PrismaReviewsRepository();
const usersRepository = new PrismaUsersRepository();
const wishlistRepository = new PrismaWishlistRepository();
const dashboardRepository = new PrismaDashboardRepository();
const notificationsRepository = new PrismaNotificationsRepository();

// ---------- Cross-cutting infra services ----------
const emailService = new EmailService();

// ---------- Domain services ----------
const productsService = new ProductsService(productsRepository);
const authService = new AuthService(authRepository, emailService);
const cartService = new CartService(cartRepository);
const checkoutService = new CheckoutService(checkoutRepository, emailService);
const ordersService = new OrdersService(ordersRepository);
const reviewsService = new ReviewsService(reviewsRepository);
const usersService = new UsersService(usersRepository);
const wishlistService = new WishlistService(wishlistRepository);
const dashboardService = new DashboardService(dashboardRepository);
const notificationsService = new NotificationsService(notificationsRepository);
const orderPlacedHandler = new OrderPlacedHandler(emailService);
const orderStatusChangedHandler = new OrderStatusChangedHandler(
  notificationsService,
);

export { eventBus };

// ---------- Controllers ----------
export const productsController = new ProductsController(productsService);
export const authController = new AuthController(authService);
export const cartController = new CartController(cartService);
export const checkoutController = new CheckoutController(checkoutService);
export const ordersController = new OrdersController(ordersService);
export const reviewsController = new ReviewsController(reviewsService);
export const usersController = new UsersController(usersService);
export const wishlistController = new WishlistController(wishlistService);
export const dashboardController = new DashboardController(dashboardService);
export const notificationsController = new NotificationsController(
  notificationsService,
);

eventBus.subscribe(
  OrderPlacedEvent.name,
  orderPlacedHandler.handle.bind(orderPlacedHandler),
);

eventBus.subscribe(
  OrderStatusChangedEvent.name,
  orderStatusChangedHandler.handle.bind(orderStatusChangedHandler),
);
