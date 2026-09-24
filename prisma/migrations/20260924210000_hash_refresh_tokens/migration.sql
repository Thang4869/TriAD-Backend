-- Existing plaintext refresh tokens cannot be recovered as hashes safely.
-- Invalidate them before the application starts writing hashed tokens.
DELETE FROM "refresh_tokens";