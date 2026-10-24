import { z } from "zod";

export const checkoutSchema = z.object({
  body: z.object({
    idempotencyKey: z.string().optional(),
    paymentMethod: z.literal("COD", {
      error: "Only COD payment is currently supported",
    }),
    address: z
      .string()
      .min(5, "Address is required and must be at least 5 characters"),
    phone: z.string().regex(/^[0-9]{10,11}$/, "Phone must be 10-11 digits"),
    notes: z.string().optional(),
    discountCode: z.string().optional(),
    expectedTotal: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
  }),
});

export const checkoutQuoteSchema = z.object({
  query: z.object({
    discountCode: z.string().trim().min(1).max(64).optional(),
  }),
});

export const getOrdersQuerySchema = z.object({
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

export const getOrderParamsSchema = z.object({
  params: z.object({
    orderId: z.string().uuid("Invalid order ID format"),
  }),
});
