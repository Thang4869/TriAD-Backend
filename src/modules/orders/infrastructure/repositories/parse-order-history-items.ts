import { z } from "zod";
import type { OrderHistoryItemView } from "../../application/order-history-read.port";

const orderHistoryItemSchema = z.object({
  productId: z.string().min(1),
  productName: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().finite().nonnegative(),
});

const orderHistoryItemsSchema = z.array(orderHistoryItemSchema);

// Prisma JSON is untrusted persisted data; never blindly cast it into the API view.
export function parseOrderHistoryItems(value: unknown): OrderHistoryItemView[] {
  const parsed = orderHistoryItemsSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Invalid order history projection items");
  }
  return parsed.data;
}
