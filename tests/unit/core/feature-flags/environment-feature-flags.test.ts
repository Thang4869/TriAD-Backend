import { afterEach, describe, expect, it } from "vitest";
import { EnvironmentFeatureFlags } from "@core/feature-flags/environment-feature-flags";
import { FeatureFlag } from "@shared/application/feature-flags/feature-flag.port";

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("FEATURE_")) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    if (key.startsWith("FEATURE_") && value !== undefined) process.env[key] = value;
  }
});

describe("EnvironmentFeatureFlags", () => {
  const flags = new EnvironmentFeatureFlags();

  it("uses an explicit true value", () => {
    process.env.FEATURE_CHECKOUT = "true";
    expect(flags.isEnabled("checkout" as keyof typeof FeatureFlag)).toBe(true);
  });

  it("treats any explicit value other than true as disabled", () => {
    process.env.FEATURE_CHECKOUT = "1";
    expect(flags.isEnabled("checkout" as keyof typeof FeatureFlag)).toBe(false);
  });

  it("uses deterministic user bucketing when rollout is configured", () => {
    process.env.FEATURE_FLAG_ROLLOUT_PERCENT = "100";
    expect(flags.isEnabled("checkout" as keyof typeof FeatureFlag, { userId: "user-1" })).toBe(true);
    process.env.FEATURE_FLAG_ROLLOUT_PERCENT = "0";
    expect(flags.isEnabled("checkout" as keyof typeof FeatureFlag, { userId: "user-1" })).toBe(false);
  });

  it("falls back to the built-in discount-system default", () => {
    delete process.env.FEATURE_FLAG_ROLLOUT_PERCENT;
    expect(flags.isEnabled(FeatureFlag.DiscountSystem)).toBe(true);
    expect(flags.isEnabled("checkout" as keyof typeof FeatureFlag)).toBe(false);
  });

  it("does not apply rollout bucketing without a user id", () => {
    process.env.FEATURE_FLAG_ROLLOUT_PERCENT = "100";
    expect(flags.isEnabled("checkout" as keyof typeof FeatureFlag, {})).toBe(false);
  });
});
