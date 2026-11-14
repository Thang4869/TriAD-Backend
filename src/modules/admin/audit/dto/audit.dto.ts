import { z } from "zod";
import { AUDIT_ACTIONS } from "../application/audit.types";

export const auditQuerySchema = z.object({
  query: z
    .object({
      page: z
        .string()
        .default("1")
        .transform(Number)
        .pipe(z.number().int().min(1)),
      limit: z
        .string()
        .default("50")
        .transform(Number)
        .pipe(z.number().int().min(1).max(100)),
      actorId: z.string().uuid().optional(),
      action: z
        .enum(Object.values(AUDIT_ACTIONS) as [string, ...string[]])
        .optional(),
      targetType: z.string().max(80).optional(),
      targetId: z.string().max(128).optional(),
      outcome: z.enum(["SUCCESS", "FAILURE", "DENIED"]).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    })
    .refine(
      (query) => !query.from || !query.to || query.from <= query.to,
      "from must be earlier than or equal to to",
    ),
});
