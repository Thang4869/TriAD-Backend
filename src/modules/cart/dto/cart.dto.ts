import { z } from "zod";

// Admin-created products use UUIDs; legacy Prisma products use CUIDs.
const productIdSchema = z.union(
  [
    z.string().uuid("Invalid product ID"),
    z.string().cuid("Invalid product ID"),
  ],
  { error: "Invalid product ID" },
);

export const addItemSchema = z.object({
  body: z.object({
    productId: productIdSchema,
    quantity: z.number().int().positive("Quantity must be positive"),
  }),
});

export const updateItemSchema = z.object({
  body: z.object({
    quantity: z.number().int().min(0, "Quantity cannot be negative"),
  }),
  params: z.object({
    productId: productIdSchema,
  }),
});
