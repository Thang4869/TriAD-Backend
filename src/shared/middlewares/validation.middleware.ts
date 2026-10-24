import { Request, Response, NextFunction } from "express";
import { ZodType, ZodError } from "zod";
import { ValidationError } from "@shared/errors/application-error";

export const validate = (
  schema: ZodType<{
    body?: unknown;
    query?: Record<string, unknown>;
    params?: Request["params"];
  }>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      req.body = validated.body || req.body;
      // DTO transforms can produce numbers/booleans beyond Express ParsedQs.
      req.query = (validated.query as Request["query"]) || req.query;
      req.params = validated.params || req.params;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new ValidationError(error.issues.map((e) => e.message).join(", ")),
        );
      } else {
        next(error);
      }
    }
  };
};
