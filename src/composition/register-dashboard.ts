import { Lifetime, type Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

import { PrismaDashboardReadRepository } from "@modules/admin/dashboard/infrastructure/repositories/prisma-dashboard-read.repository";
import { DashboardService } from "@modules/admin/dashboard/dashboard.service";
import { DashboardController } from "@modules/admin/dashboard/dashboard.controller";

export function registerDashboardModule(container: Container): void {
  container.register(
    TOKENS.DashboardRead,
    () => new PrismaDashboardReadRepository(),
  );

  container.register(
    TOKENS.DashboardService,
    (c) => new DashboardService(c.resolve(TOKENS.DashboardRead)),
  );

  container.register(
    TOKENS.DashboardController,
    (c) => new DashboardController(c.resolve(TOKENS.DashboardService)),
    Lifetime.Transient,
  );
}
