import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { BadRequestError } from "@shared/utils/errors";

export const validate = (schema: ZodSchema<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      req.body = validated.body || req.body;
      req.query = validated.query || req.query;
      req.params = validated.params || req.params;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new BadRequestError(error.errors.map((e) => e.message).join(", ")),
        );
      } else {
        next(error);
      }
    }
  };
};
