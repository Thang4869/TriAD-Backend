import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { AuthSessionUserPort } from "@modules/auth/application/ports/auth-session-user.port";
import type { TokenStorePort } from "@modules/auth/application/ports/token-store.port";
import { UnauthorizedError } from "@shared/utils/errors";
import config from "@config";
import { verifyToken } from "@shared/utils/jwt";

const BLACKLIST_PREFIX = "jwt:blacklist:";

export function createAuthMiddleware(
  users: AuthSessionUserPort,
  tokenStore: TokenStorePort,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      const bearerToken =
        authHeader && authHeader.startsWith("Bearer ")
          ? authHeader.substring(7)
          : null;

      const token = bearerToken || req.cookies?.accessToken;

      if (!token) {
        throw new UnauthorizedError("No token provided");
      }

      const isBlacklisted = await tokenStore.get(`${BLACKLIST_PREFIX}${token}`);

      if (isBlacklisted) {
        throw new UnauthorizedError("Token revoked");
      }

      const decoded = verifyToken<{
        sub: string;
        email: string;
        role: string;
      }>(token, config.JWT_ACCESS_SECRET);

      const user = await users.findById(decoded.sub);

      if (!user || !user.isVerified) {
        throw new UnauthorizedError("User not found or not verified");
      }

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
      };

      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        next(new UnauthorizedError("Invalid token"));
      } else {
        next(error);
      }
    }
  };
}

export function createOptionalAuthMiddleware(
  users: AuthSessionUserPort,
  tokenStore: TokenStorePort,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);

        const isBlacklisted = await tokenStore.get(
          `${BLACKLIST_PREFIX}${token}`,
        );

        if (!isBlacklisted) {
          const decoded = verifyToken<{
            sub: string;
            email: string;
            role: string;
          }>(token, config.JWT_ACCESS_SECRET);

          const user = await users.findById(decoded.sub);

          if (user) {
            req.user = {
              id: user.id,
              email: user.email,
              role: user.role,
            };
          }
        }
      }
    } catch {
      // Ignore errors in optional auth
    }

    next();
  };
}
