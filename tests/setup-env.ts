// This file runs only through Vitest setupFiles, never in production runtime.
process.env.NODE_ENV ??= "test";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-32charslongenough";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-32charslongenough";
process.env.JWT_PREAUTH_SECRET ??= "test-preauth-secret-32charslongenough";
process.env.TOTP_ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/triad_test?schema=public";
