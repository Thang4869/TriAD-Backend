import { Lifetime, type Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

import { PrismaCheckoutRepository } from "@modules/checkout/infrastructure/repositories/prisma-checkout.repository";
import { PrismaCheckoutUnitOfWork } from "@modules/checkout/infrastructure/prisma-checkout-unit-of-work";
import { CryptoOrderNumberGenerator } from "@modules/checkout/infrastructure/order-number-generator";

import { PricingService } from "@modules/checkout/services/pricing.service";
import { StockReservationService } from "@modules/checkout/services/stock-reservation.service";
import { CheckoutService } from "@modules/checkout/checkout.service";
import { CheckoutController } from "@modules/checkout/checkout.controller";

export function registerCheckoutModule(container: Container): void {
  container.register(
    TOKENS.CheckoutRepository,
    () => new PrismaCheckoutRepository(),
  );

  container.register(
    TOKENS.CheckoutUnitOfWork,
    () => new PrismaCheckoutUnitOfWork(),
  );

  container.register(
    TOKENS.PricingService,
    (c) => new PricingService(c.resolve(TOKENS.FeatureFlags)),
  );

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
    TOKENS.CheckoutController,
    (c) => new CheckoutController(c.resolve(TOKENS.CheckoutService)),
    Lifetime.Transient,
  );
}
