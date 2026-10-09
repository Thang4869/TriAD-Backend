import { Lifetime, type Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

import { PrismaReviewsRepository } from "@modules/reviews/infrastructure/repositories/prisma-reviews.repository";
import { ReviewsService } from "@modules/reviews/reviews.service";
import { ReviewsController } from "@modules/reviews/reviews.controller";

export function registerReviewsModule(container: Container): void {
  container.register(
    TOKENS.ReviewsRepository,
    () => new PrismaReviewsRepository(),
  );

  container.register(
    TOKENS.ReviewsService,
    (c) =>
      new ReviewsService(
        c.resolve(TOKENS.ReviewsRepository),
        c.resolve(TOKENS.EventBus),
      ),
  );

  container.register(
    TOKENS.ReviewsController,
    (c) => new ReviewsController(c.resolve(TOKENS.ReviewsService)),
    Lifetime.Transient,
  );
}
