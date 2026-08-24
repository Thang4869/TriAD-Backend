import { z } from "zod";

export const addItemSchema = z.object({
  body: z.object({
    productId: z.string().uuid("Invalid product ID"),
    quantity: z.number().int().positive("Quantity must be positive"),
  }),
});

export const updateItemSchema = z.object({
  body: z.object({
    quantity: z.number().int().min(0, "Quantity cannot be negative"),
  }),
  params: z.object({
    productId: z.string().uuid("Invalid product ID"),
  }),
});
