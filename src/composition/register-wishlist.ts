import { Lifetime, type Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

import { PrismaWishlistRepository } from "@modules/wishlist/infrastructure/repositories/prisma-wishlist.repository";
import { WishlistService } from "@modules/wishlist/wishlist.service";
import { WishlistController } from "@modules/wishlist/wishlist.controller";

export function registerWishlistModule(container: Container): void {
  container.register(
    TOKENS.WishlistRepository,
    () => new PrismaWishlistRepository(),
  );

  container.register(
    TOKENS.WishlistService,
    (c) => new WishlistService(c.resolve(TOKENS.WishlistRepository)),
  );

  container.register(
    TOKENS.WishlistController,
    (c) => new WishlistController(c.resolve(TOKENS.WishlistService)),
    Lifetime.Transient,
  );
}
