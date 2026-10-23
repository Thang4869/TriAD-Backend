import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { RequestHandler } from "express";

const digest = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

/** Authenticate the server-side edge before accepting its single client address. */
export function createTrustedEdgeMiddleware(secret?: string): RequestHandler {
  const expected = secret ? digest(secret) : undefined;
  return (req, res, next) => {
    const key = req.headers["x-triad-edge-key"];
    const ip = req.headers["x-triad-client-ip"];
    // Never pass the shared credential to routes, request logging or providers.
    delete req.headers["x-triad-edge-key"];
    delete req.headers["x-triad-client-ip"];
    if (!expected) return next();

    if (
      typeof key !== "string" ||
      key.length > 256 ||
      !timingSafeEqual(expected, digest(key)) ||
      typeof ip !== "string" ||
      !isIP(ip)
    ) {
      res
        .status(403)
        .json({ success: false, error: "Trusted API edge required" });
      return;
    }

    // TRUST_PROXY remains 0. Only the authenticated edge may set this property;
    // client-supplied XFF/Forwarded headers never become limiter identities.
    Object.defineProperty(req, "ip", { value: ip, configurable: true });
    next();
  };
}
