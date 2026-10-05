import { Request, Response, NextFunction } from "express";
import type { AuthSessionUserPort } from "@modules/auth/application/ports/auth-session-user.port";
import type { AccessTokenVerifierPort } from "@modules/auth/application/ports/access-token-verifier.port";
import { AuthenticationError } from "@shared/errors/application-error";

export function createAuthMiddleware(
  users: AuthSessionUserPort,
  tokenVerifier: AccessTokenVerifierPort,
) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      const bearerToken =
        authHeader?.startsWith("Bearer ") === true
          ? authHeader.substring(7)
          : null;

      const token = bearerToken || req.cookies?.accessToken;

      if (!token) {
        throw new AuthenticationError("No token provided");
      }

      if (await tokenVerifier.isAccessTokenRevoked(token)) {
        throw new AuthenticationError("Token revoked");
      }

      const decoded = tokenVerifier.verifyAccessToken(token);

      const user = await users.findById(decoded.sub);

      if (!user || !user.isVerified) {
        throw new AuthenticationError("User not found or not verified");
      }

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createOptionalAuthMiddleware(
  users: AuthSessionUserPort,
  tokenVerifier: AccessTokenVerifierPort,
) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);

        if (!(await tokenVerifier.isAccessTokenRevoked(token))) {
          const decoded = tokenVerifier.verifyAccessToken(token);
          const user = await users.findById(decoded.sub);

          if (user?.isVerified) {
            req.user = {
              id: user.id,
              email: user.email,
              role: user.role,
            };
          }
        }
      }
    } catch {
      // Optional authentication intentionally falls back to guest.
    }

    next();
  };
}
