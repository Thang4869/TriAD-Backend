export const FeatureFlag = {
  RequireTwoFactor: "require_two_factor",
  DiscountSystem: "discount_system",
} as const;

export type FeatureFlagKey = (typeof FeatureFlag)[keyof typeof FeatureFlag];

export interface FeatureFlagPort {
  isEnabled(key: FeatureFlagKey, context?: Record<string, unknown>): boolean;
}
