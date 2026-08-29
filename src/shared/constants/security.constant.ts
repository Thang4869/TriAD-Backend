export const SECURITY = {
  BCRYPT_SALT_ROUNDS: 10,
  BLACKLIST_KEY_PREFIX: "jwt:blacklist:",
  EMAIL_VERIFY_KEY_PREFIX: "email-verify:",
  EMAIL_VERIFY_TTL_SECONDS: 15 * 60,
  REFRESH_TOKEN_TTL_MS: 7 * 24 * 60 * 60 * 1000,
} as const;
