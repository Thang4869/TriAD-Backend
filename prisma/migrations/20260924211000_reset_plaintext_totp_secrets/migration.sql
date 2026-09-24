-- Legacy TOTP secrets were plaintext and cannot be safely encrypted in SQL
-- without exposing the application key to the migration history. Users must
-- enroll again after deployment.
UPDATE "users"
SET "totpSecret" = NULL, "is2FAEnabled" = FALSE
WHERE "totpSecret" IS NOT NULL;