import { createHealthRoutes } from "@core/health/health.routes";
import { HealthService } from "@core/health/health.service";
import { InfrastructureHealthCheck } from "@core/health/infrastructure-health-check";

export function composeHealthRoutes() {
  const healthCheck = new InfrastructureHealthCheck();
  const healthService = new HealthService(healthCheck);

  return createHealthRoutes(healthService);
}
