import { Lifetime, type Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

import { PrismaCartRepository } from "@modules/cart/infrastructure/repositories/prisma-cart.repository";
import { CartService } from "@modules/cart/cart.service";
import { CartController } from "@modules/cart/cart.controller";

export function registerCartModule(container: Container): void {
  container.register(TOKENS.CartRepository, () => new PrismaCartRepository());

  container.register(
    TOKENS.CartService,
    (c) => new CartService(c.resolve(TOKENS.CartRepository)),
  );

  container.register(
    TOKENS.CartController,
    (c) => new CartController(c.resolve(TOKENS.CartService)),
    Lifetime.Transient,
  );
}
