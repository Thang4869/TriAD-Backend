import { Lifetime, type Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

import { PrismaOrdersRepository } from "@modules/orders/infrastructure/repositories/prisma-orders.repository";
import { PrismaOrderHistoryReadRepository } from "@modules/orders/infrastructure/repositories/prisma-order-history-read.repository";
import { OrdersService } from "@modules/orders/orders.service";
import { OrdersController } from "@modules/orders/orders.controller";

export function registerOrdersModule(container: Container): void {
  container.register(
    TOKENS.OrdersRepository,
    () => new PrismaOrdersRepository(),
  );

  container.register(
    TOKENS.OrderHistoryRead,
    () => new PrismaOrderHistoryReadRepository(),
  );

  container.register(
    TOKENS.OrdersService,
    (c) =>
      new OrdersService(
        c.resolve(TOKENS.OrdersRepository),
        c.resolve(TOKENS.OrderHistoryRead),
      ),
  );

  container.register(
    TOKENS.OrdersController,
    (c) => new OrdersController(c.resolve(TOKENS.OrdersService)),
    Lifetime.Transient,
  );
}
