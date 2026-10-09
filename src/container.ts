import { Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

// Infrastructure composition
import { registerCoreInfrastructure } from "@/composition/register-core-infrastructure";

// Business modules
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

// Domain-event composition
import { registerDomainEventHandlers } from "@/composition/register-domain-event-handlers";
import { wireDomainEvents } from "@/composition/wire-domain-events";

// HTTP middleware
import {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
} from "@shared/middlewares/auth.middleware";
import { createErrorHandler } from "@shared/middlewares/error-handler.middleware";

// Background jobs
import { processImage } from "@/jobs/image-process.job";

// Composition root
export const container = new Container();

// 1. Infrastructure
registerCoreInfrastructure(container);

// 2. Business modules
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

// 3. Domain events
registerDomainEventHandlers(container);
wireDomainEvents(container);

// 4. Shared EventBus
export const eventBus = container.resolve(TOKENS.EventBus);

// 5. HTTP controllers
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

// 6. Authentication and HTTP middleware
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

// 7. Background jobs
export const imageJobProcessor = (job: Parameters<typeof processImage>[0]) =>
  processImage(
    job,
    container.resolve(TOKENS.ProductsRepository),
    container.resolve(TOKENS.ImageStorage),
  );
