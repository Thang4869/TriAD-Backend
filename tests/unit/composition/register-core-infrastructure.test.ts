import { describe, expect, it } from "vitest";
import { Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";
import { registerCoreInfrastructure } from "@/composition/register-core-infrastructure";

describe("registerCoreInfrastructure", () => {
  it("registers and resolves every core infrastructure dependency", () => {
    const container = new Container();
    registerCoreInfrastructure(container);

    const resolved = [
      container.resolve(TOKENS.EventBus),
      container.resolve(TOKENS.EmailQueue),
      container.resolve(TOKENS.EmailService),
      container.resolve(TOKENS.ImageStorage),
      container.resolve(TOKENS.FeatureFlags),
      container.resolve(TOKENS.PersistenceErrorClassifier),
      container.resolve(TOKENS.Tracer),
      container.resolve(TOKENS.Metrics),
      container.resolve(TOKENS.ProjectionStore),
      container.resolve(TOKENS.OutboxRelayStore),
      container.resolve(TOKENS.HandlerExecutionTracker),
      container.resolve(TOKENS.OutboxRelay),
    ];

    expect(resolved).toHaveLength(12);
    expect(resolved.every(Boolean)).toBe(true);
  });
});
