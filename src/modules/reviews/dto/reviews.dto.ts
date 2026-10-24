import { z } from "zod";

export const createReviewSchema = z.object({
  body: z.object({
    productId: z.string().uuid("Invalid product ID"),
    rating: z
      .number()
      .int()
      .min(1, "Rating must be at least 1")
      .max(5, "Rating must be at most 5"),
    content: z.string().min(3, "Content must be at least 3 characters"),
  }),
});

export const getReviewsQuerySchema = z.object({
  query: z.object({
    page: z
      .string()
      .default("1")
      .transform(Number)
      .pipe(z.number().int().min(1)),
    limit: z
      .string()
      .default("10")
      .transform(Number)
      .pipe(z.number().int().min(1).max(50)),
  }),
  params: z.object({
    productId: z.string().uuid("Invalid product ID"),
  }),
});

export const deleteReviewParamsSchema = z.object({
  params: z.object({
    reviewId: z.string().uuid("Invalid review ID"),
  }),
});

export const adminGetAllReviewsQuerySchema = z.object({
  query: z.object({
    page: z
      .string()
      .default("1")
      .transform(Number)
      .pipe(z.number().int().min(1)),
    limit: z
      .string()
      .default("10")
      .transform(Number)
      .pipe(z.number().int().min(1).max(50)),
  }),
});
