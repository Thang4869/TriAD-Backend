import { z } from "zod";
import { OrderStatus } from "@prisma/client";

export const updateOrderStatusSchema = z.object({
  body: z.object({
    status: z.enum(Object.values(OrderStatus) as [string, ...string[]], {
      errorMap: () => ({ message: "Invalid order status" }),
    }),
  }),
  params: z.object({
    orderId: z.string().uuid("Invalid order ID format"),
  }),
});

export const adminGetOrdersQuerySchema = z.object({
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
    status: z
      .enum(Object.values(OrderStatus) as [string, ...string[]])
      .optional(),
    userId: z.string().uuid("Invalid user ID format").optional(),
  }),
});

export const getOrderParamsSchema = z.object({
  params: z.object({
    orderId: z.string().uuid("Invalid order ID format"),
  }),
});

export const getMyOrdersQuerySchema = z.object({
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
