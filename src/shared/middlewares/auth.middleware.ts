import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "@core/database/prisma";
import redis from "@core/redis/client";
import { UnauthorizedError } from "@shared/utils/errors";

const BLACKLIST_PREFIX = "jwt:blacklist:";

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
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

    const isBlacklisted = await redis.exists(`${BLACKLIST_PREFIX}${token}`);
    if (isBlacklisted) {
      throw new UnauthorizedError("Token revoked");
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as {
      sub: string;
      email: string;
      role: string;
    };

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, role: true, isVerified: true },
    });

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

export const optionalAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.substring(7)
        : null;

    const token = bearerToken || req.cookies?.accessToken;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);

      const isBlacklisted = await redis.exists(`${BLACKLIST_PREFIX}${token}`);
      if (!isBlacklisted) {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as {
          sub: string;
          email: string;
          role: string;
        };
        const user = await prisma.user.findUnique({
          where: { id: decoded.sub },
          select: { id: true, email: true, role: true },
        });
        if (user) {
          req.user = user;
        }
      }
    }
  } catch {
    // Ignore errors in optional auth
  }
  next();
};
