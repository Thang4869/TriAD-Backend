import { Request, Response, NextFunction } from "express";
import { ForbiddenError } from "@shared/utils/errors";

export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ForbiddenError("Authentication required"));
    }

    if (!roles.includes((req.user as { role: string }).role)) {
      return next(new ForbiddenError("Insufficient permissions"));
    }

    next();
  };
};

export const requireAdmin = requireRole("ADMIN");
export const requireUserOrAdmin = requireRole("USER", "ADMIN");
