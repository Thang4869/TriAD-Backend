import { Lifetime, type Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

import { PrismaNotificationsRepository } from "@modules/notifications/infrastructure/repositories/prisma-notifications.repository";
import { NotificationsService } from "@modules/notifications/notifications.service";
import { NotificationsController } from "@modules/notifications/notifications.controller";

export function registerNotificationsModule(container: Container): void {
  container.register(
    TOKENS.NotificationsRepository,
    () => new PrismaNotificationsRepository(),
  );

  container.register(
    TOKENS.NotificationsService,
    (c) => new NotificationsService(c.resolve(TOKENS.NotificationsRepository)),
  );

  container.register(
    TOKENS.NotificationsController,
    (c) => new NotificationsController(c.resolve(TOKENS.NotificationsService)),
    Lifetime.Transient,
  );
}
