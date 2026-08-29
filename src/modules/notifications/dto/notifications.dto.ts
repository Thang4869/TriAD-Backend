import { z } from "zod";

export const getNotificationsQuerySchema = z.object({
  query: z.object({
    page: z
      .string()
      .optional()
      .transform(Number)
      .pipe(z.number().int().min(1).default(1)),
    limit: z
      .string()
      .optional()
      .transform(Number)
      .pipe(z.number().int().min(1).max(50).default(10)),
  }),
});

export const markAsReadParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid notification ID"),
  }),
});
