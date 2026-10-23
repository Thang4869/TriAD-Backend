import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import config from "@config";
import { AuthorizationError } from "@shared/errors/application-error";
import {
  isCsrfTokenForSession,
  readCsrfSessionId,
} from "@shared/utils/csrf-token";
export { generateCsrfToken } from "@shared/utils/csrf-token";

export const CSRF_COOKIE_NAME = "csrfToken";
const CSRF_HEADER_NAME = "x-csrf-token";

export function csrfCookieOptions(maxAge: number) {
  return {
    httpOnly: false,
    secure: config.isProduction,
    sameSite: (config.isProduction ? "none" : "lax") as "none" | "lax",
    path: "/",
    maxAge,
    ...(config.COOKIE_DOMAIN && {
      domain: config.COOKIE_DOMAIN,
    }),
  };
}

export const csrfProtection = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const usesBearerAuth =
    req.headers.authorization?.startsWith("Bearer ") === true &&
    req.headers.authorization.length > 7;
  const route = `${req.baseUrl || ""}${req.path || ""}`
    .replace(/\/+$/, "")
    .toLowerCase();
  const publicWriteRoute =
    route === "/api/auth/login" ||
    route === "/api/auth/register" ||
    route === "/api/auth/resend-verification" ||
    route === "/api/auth/verify-totp";
  const relyingOnCookie = Boolean(
    req.cookies?.accessToken || req.cookies?.refreshToken,
  );

  if (publicWriteRoute) {
    // These endpoints establish identity before a session-bound token exists.
    // JSON forces cross-origin browser fetches through the strict CORS preflight;
    // HTML forms and text/plain must never establish an authenticated session.
    const contentType = req.headers["content-type"]
      ?.split(";")[0]
      .trim()
      .toLowerCase();
    const fetchSite = req.headers["sec-fetch-site"];
    if (
      contentType !== "application/json" ||
      (config.isProduction &&
        (fetchSite === "cross-site" || fetchSite === "same-site") &&
        !req.headers.origin)
    )
      return next(
        new AuthorizationError("Invalid public authentication request"),
      );
    return next();
  }

  if (usesBearerAuth || !relyingOnCookie) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];
  // Bind normal writes to the access identity, not an independently injected
  // refresh cookie. Refresh uses its own credential even after access expiry.
  const useRefresh =
    Boolean(req.cookies?.refreshToken) &&
    (route === "/api/auth/refresh" || !req.cookies?.accessToken);
  const sessionId = readCsrfSessionId(
    useRefresh ? req.cookies?.refreshToken : req.cookies?.accessToken,
    useRefresh ? "refresh" : "access",
  );

  if (
    typeof cookieToken !== "string" ||
    !/^[a-f0-9]{64}$/.test(cookieToken) ||
    !headerToken ||
    typeof headerToken !== "string" ||
    !timingSafeEqual(cookieToken, headerToken) ||
    !sessionId ||
    !isCsrfTokenForSession(cookieToken, sessionId)
  ) {
    return next(new AuthorizationError("Invalid or missing CSRF token"));
  }

  next();
};

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
