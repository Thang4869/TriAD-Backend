import { Request, Response, NextFunction } from "express";
import { Container } from "@core/di/container";

export function requestScope(rootContainer: Container) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.container = rootContainer.createScope();
    next();
  };
}
