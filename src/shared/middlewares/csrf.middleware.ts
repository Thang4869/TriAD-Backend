import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import config from "@config";
import { ForbiddenError } from "@shared/utils/errors";

export const CSRF_COOKIE_NAME = "csrfToken";
const CSRF_HEADER_NAME = "x-csrf-token";

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function csrfCookieOptions(maxAge: number) {
  return {
    httpOnly: false,
    secure: config.isProduction,
    sameSite: (config.isProduction ? "none" : "lax") as "none" | "lax",
    path: "/",
    maxAge,
    ...(process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN }),
  };
}

export const csrfProtection = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const usesBearerAuth = Boolean(req.headers.authorization);
  const relyingOnCookie = Boolean(req.cookies?.refreshToken);

  if (usesBearerAuth || !relyingOnCookie) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (
    !cookieToken ||
    !headerToken ||
    typeof headerToken !== "string" ||
    !timingSafeEqual(cookieToken, headerToken)
  ) {
    return next(new ForbiddenError("Invalid or missing CSRF token"));
  }

  next();
};

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
