import { z } from "zod";

export const checkoutSchema = z.object({
  body: z.object({
    idempotencyKey: z.string().optional(),
    paymentMethod: z.enum(["COD", "CARD", "BANKING"], {
      errorMap: () => ({
        message: "Payment method must be COD, CARD, or BANKING",
      }),
    }),
    address: z
      .string()
      .min(5, "Address is required and must be at least 5 characters"),
    phone: z.string().regex(/^[0-9]{10,11}$/, "Phone must be 10-11 digits"),
    notes: z.string().optional(),
    discountCode: z.string().optional(),
  }),
});

export const getOrdersQuerySchema = z.object({
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

export const getOrderParamsSchema = z.object({
  params: z.object({
    orderId: z.string().uuid("Invalid order ID format"),
  }),
});
