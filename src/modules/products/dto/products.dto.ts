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

// ---------- Admin schemas ----------

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required").max(255),
    description: z.string().min(1, "Description is required"),
    price: z.number().positive("Price must be greater than 0"),
    stock: z.number().int().min(0, "Stock cannot be negative"),
    category: z.string().min(1, "Category is required"),
    images: z.array(z.string().url("Each image must be a valid URL")).min(1, "At least one image is required"),
    slug: z
      .string()
      .min(1, "Slug is required")
      .regex(slugRegex, "Slug must be lowercase letters, numbers and hyphens only"),
  }),
});

export const updateProductSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid product ID"),
  }),
  body: z
    .object({
      name: z.string().min(1).max(255).optional(),
      description: z.string().min(1).optional(),
      price: z.number().positive("Price must be greater than 0").optional(),
      stock: z.number().int().min(0, "Stock cannot be negative").optional(),
      category: z.string().min(1).optional(),
      images: z.array(z.string().url("Each image must be a valid URL")).min(1).optional(),
      slug: z
        .string()
        .min(1)
        .regex(slugRegex, "Slug must be lowercase letters, numbers and hyphens only")
        .optional(),
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided to update",
    }),
});

export const deleteProductParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid product ID"),
  }),
});

export const adminGetProductsQuerySchema = z.object({
  query: z.object({
    page: z.string().optional().transform(Number).pipe(z.number().int().min(1).default(1)),
    limit: z.string().optional().transform(Number).pipe(z.number().int().min(1).max(50).default(20)),
    category: z.string().optional(),
    keyword: z.string().optional(),
    isActive: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
    sortBy: z.enum(["createdAt", "price", "name", "stock"]).optional().default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  }),
});

export const searchProductsQuerySchema = z.object({
  query: z.object({
    q: z.string().min(2, "Search query must be at least 2 characters"),
    page: z.string().optional().transform(Number).pipe(z.number().int().min(1).default(1)),
    limit: z.string().optional().transform(Number).pipe(z.number().int().min(1).max(50).default(12)),
  }),
});