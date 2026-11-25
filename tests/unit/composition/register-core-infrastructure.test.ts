import { describe, expect, it } from "vitest";
import { Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";
import { registerCoreInfrastructure } from "@/composition/register-core-infrastructure";

describe("registerCoreInfrastructure", () => {
  it("registers and resolves every core infrastructure dependency", () => {
    const container = new Container();
    registerCoreInfrastructure(container);

    const resolved = [
      TOKENS.EventBus,
      TOKENS.EmailQueue,
      TOKENS.EmailService,
      TOKENS.ImageStorage,
      TOKENS.FeatureFlags,
      TOKENS.PersistenceErrorClassifier,
      TOKENS.Tracer,
      TOKENS.Metrics,
      TOKENS.ProjectionStore,
      TOKENS.OutboxRelayStore,
      TOKENS.HandlerExecutionTracker,
      TOKENS.OutboxRelay,
    ].map((token) => container.resolve(token));

    expect(resolved).toHaveLength(12);
    expect(resolved.every(Boolean)).toBe(true);
  });
});
