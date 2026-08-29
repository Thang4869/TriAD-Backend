import { z } from "zod";

export const addToWishlistSchema = z.object({
  body: z.object({
    productId: z.string().uuid("Invalid product ID"),
  }),
});

export const removeFromWishlistSchema = z.object({
  params: z.object({
    productId: z.string().uuid("Invalid product ID"),
  }),
});

export const getWishlistQuerySchema = z.object({
  query: z.object({
    page: z.string().optional().transform(Number).pipe(z.number().int().min(1).default(1)),
    limit: z.string().optional().transform(Number).pipe(z.number().int().min(1).max(50).default(20)),
  }),
});