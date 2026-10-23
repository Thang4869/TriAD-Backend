import crypto from "crypto";
import { decode } from "jsonwebtoken";
import config from "@config";

// 128-bit random nonce + 128-bit HMAC tag preserve the opaque 64-hex FE contract.
// Domain separation prevents this MAC from being used as a JWT signature.
function signature(sessionId: string, nonce: string): string {
  return crypto
    .createHmac("sha256", config.JWT_REFRESH_SECRET)
    .update(`triad:csrf:v1\0${sessionId.length}!${sessionId}!${nonce}`)
    .digest("hex")
    .slice(0, 32);
}

export function generateCsrfToken(sessionId: string): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  return nonce + signature(sessionId, nonce);
}

export function isCsrfTokenForSession(
  token: string,
  sessionId: string,
): boolean {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const nonce = token.slice(0, 32);
  return crypto.timingSafeEqual(
    Buffer.from(token.slice(32), "hex"),
    Buffer.from(signature(sessionId, nonce), "hex"),
  );
}

// Decoding only selects the CSRF binding. It NEVER authenticates a request:
// access middleware / refresh service must still verify the JWT and revocation.
export function readCsrfSessionId(
  token: unknown,
  tokenType: "access" | "refresh",
): string | null {
  if (typeof token !== "string") return null;
  const claims = decode(token);
  if (!claims || typeof claims !== "object" || claims.tokenType !== tokenType)
    return null;
  const sessionId = tokenType === "access" ? claims.sessionId : claims.familyId;
  return typeof sessionId === "string" && sessionId.length > 0
    ? sessionId
    : null;
}
