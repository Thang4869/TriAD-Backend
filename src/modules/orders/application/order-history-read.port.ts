import { OrderStatus } from "../domain/order-status";

export interface OrderHistoryItemView {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderHistoryView {
  orderId: string;
  userId: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  subtotal: number;
  tax: number;
  shippingFee: number;
  total: number;
  items: OrderHistoryItemView[];
  placedAt: Date;
  updatedAt: Date;
}

export interface OrderHistoryReadPort {
  findByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<OrderHistoryView[]>;

  countByUser(userId: string): Promise<number>;

  findByIdAndUser(
    orderId: string,
    userId: string,
  ): Promise<OrderHistoryView | null>;
}
