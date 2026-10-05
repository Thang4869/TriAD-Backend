import { Request, Response, NextFunction } from "express";
import {
  AuthenticationError,
  AuthorizationError,
} from "@shared/errors/application-error";
import { Role, ROLES, ALL_ROLES } from "@shared/types/roles";

export const requireRole = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AuthenticationError("Authentication required"));
    }

    if (!roles.includes((req.user as { role: Role }).role)) {
      return next(new AuthorizationError("Insufficient permissions"));
    }

    next();
  };
};

export const requireAdmin = requireRole(ROLES.ADMIN);
export const requireUserOrAdmin = requireRole(...ALL_ROLES);
