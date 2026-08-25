import { z } from "zod";

export const getProductsQuerySchema = z.object({
  query: z.object({
    page: z.string().optional().transform(Number).pipe(z.number().int().min(1).default(1)),
    limit: z.string().optional().transform(Number).pipe(z.number().int().min(1).max(50).default(12)),
    category: z.string().optional(),
    minPrice: z.string().optional().transform(Number).pipe(z.number().min(0).optional()),
    maxPrice: z.string().optional().transform(Number).pipe(z.number().min(0).optional()),
    keyword: z.string().optional(),
    sortBy: z.enum(["createdAt", "price", "name", "rating"]).optional().default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  }),
});

export const getProductParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid product ID"),
  }),
});

export const getProductBySlugParamsSchema = z.object({
  params: z.object({
    slug: z.string().min(1, "Slug is required"),
  }),
});