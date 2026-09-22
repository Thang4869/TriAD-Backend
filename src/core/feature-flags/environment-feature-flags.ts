import {
  FeatureFlag,
  FeatureFlagKey,
  FeatureFlagPort,
} from "@shared/application/feature-flags/feature-flag.port";

export class EnvironmentFeatureFlags implements FeatureFlagPort {
  isEnabled(key: FeatureFlagKey, context?: Record<string, unknown>): boolean {
    const explicit = process.env[`FEATURE_${key.toUpperCase()}`];
    if (explicit !== undefined) return explicit === "true";
    if (context?.userId && process.env.FEATURE_FLAG_ROLLOUT_PERCENT) {
      const percent = Number(process.env.FEATURE_FLAG_ROLLOUT_PERCENT);
      const bucket =
        [...String(context.userId)].reduce(
          (sum, char) => sum + char.charCodeAt(0),
          0,
        ) % 100;
      return bucket < percent;
    }
    return key === FeatureFlag.DiscountSystem;
  }
}
