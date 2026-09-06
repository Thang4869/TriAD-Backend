import { createToken } from "./container";
import type { IProductsRepository } from "@modules/products/products.repository";
import type { IAuthRepository } from "@modules/auth/auth.repository";
import type { ICartRepository } from "@modules/cart/cart.repository";
import type { ICheckoutRepository } from "@modules/checkout/checkout.repository";
import type { IOrdersRepository } from "@modules/orders/orders.repository";
import type { IReviewsRepository } from "@modules/reviews/reviews.repository";
import type { IUsersRepository } from "@modules/users/users.repository";
import type { IWishlistRepository } from "@modules/wishlist/wishlist.repository";
import type { IDashboardRepository } from "@modules/admin/dashboard/dashboard.repository";
import type { INotificationsRepository } from "@modules/notifications/notifications.repository";

import type { ProductsService } from "@modules/products/products.service";
import type { AuthService } from "@modules/auth/auth.service";
import type { CartService } from "@modules/cart/cart.service";
import type { ICheckoutService } from "@modules/checkout/checkout.service";
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

export const TOKENS = {
  // Repositories
  ProductsRepository: createToken<IProductsRepository>("ProductsRepository"),
  AuthRepository: createToken<IAuthRepository>("AuthRepository"),
  CartRepository: createToken<ICartRepository>("CartRepository"),
  CheckoutRepository: createToken<ICheckoutRepository>("CheckoutRepository"),
  OrdersRepository: createToken<IOrdersRepository>("OrdersRepository"),
  ReviewsRepository: createToken<IReviewsRepository>("ReviewsRepository"),
  UsersRepository: createToken<IUsersRepository>("UsersRepository"),
  WishlistRepository: createToken<IWishlistRepository>("WishlistRepository"),
  DashboardRepository: createToken<IDashboardRepository>("DashboardRepository"),
  NotificationsRepository: createToken<INotificationsRepository>(
    "NotificationsRepository",
  ),

  // Cross-cutting infra
  EmailService: createToken<EmailService>("EmailService"),
  ImageStorage: createToken<IImageStorage>("ImageStorage"),
  EventBus: createToken<EventBus>("EventBus"),

  // Domain services
  ProductsService: createToken<ProductsService>("ProductsService"),
  AuthService: createToken<AuthService>("AuthService"),
  CartService: createToken<CartService>("CartService"),
  CheckoutService: createToken<ICheckoutService>("CheckoutService"),
  OrdersService: createToken<OrdersService>("OrdersService"),
  ReviewsService: createToken<ReviewsService>("ReviewsService"),
  UsersService: createToken<UsersService>("UsersService"),
  WishlistService: createToken<WishlistService>("WishlistService"),
  DashboardService: createToken<DashboardService>("DashboardService"),
  NotificationsService: createToken<NotificationsService>(
    "NotificationsService",
  ),

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
  OrderPlacedHandler: createToken<OrderPlacedHandler>("OrderPlacedHandler"),
  OrderStatusChangedHandler: createToken<OrderStatusChangedHandler>(
    "OrderStatusChangedHandler",
  ),
} as const;
