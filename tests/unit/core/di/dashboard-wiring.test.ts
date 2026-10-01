import { describe, expect, it } from "vitest";
import { container } from "@/container";
import { TOKENS } from "@core/di/tokens";
import { DashboardService } from "@modules/admin/dashboard/dashboard.service";
import { PrismaDashboardReadRepository } from "@modules/admin/dashboard/infrastructure/repositories/prisma-dashboard-read.repository";

describe("Dashboard query-side wiring", () => {
  it("injects the projection-backed read adapter into DashboardService", () => {
    const service = container.resolve(TOKENS.DashboardService);
    const readPort = Reflect.get(service, "repository");

    expect(service).toBeInstanceOf(DashboardService);
    expect(readPort).toBeInstanceOf(PrismaDashboardReadRepository);
  });
});
