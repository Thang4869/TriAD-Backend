import {
  Order as PrismaOrder,
  OrderItem as PrismaOrderItem,
  Product,
} from "@prisma/client";
import { Order } from "./domain/order.entity";

export class OrderMapper {
  static toDomain(
    prismaOrder: PrismaOrder & {
      items: (PrismaOrderItem & { product: Product })[];
    },
  ): Order {
    return Order.hydrate({
      id: prismaOrder.id,
      userId: prismaOrder.userId,
      orderNumber: prismaOrder.orderNumber,
      status: prismaOrder.status,
      createdAt: prismaOrder.createdAt,
      customerName: prismaOrder.customerName,
      customerEmail: prismaOrder.customerEmail,
      customerPhone: prismaOrder.customerPhone,
      customerAddress: prismaOrder.customerAddress,
      paymentMethod: prismaOrder.paymentMethod,
      paymentStatus: prismaOrder.paymentStatus,
      discountAmount: prismaOrder.discountAmount || 0,
      shippingFee: prismaOrder.shippingFee || 0,
      tax: prismaOrder.tax || 0,
      notes: prismaOrder.notes || undefined,
      discountCode: prismaOrder.discountCode || undefined,
      items: prismaOrder.items.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        quantity: item.quantity,
        price: item.price,
      })),
    });
  }

  static toPersistence(order: Order): {
    id: string;
    userId: string;
    orderNumber: string;
    status: string;
    createdAt: Date;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    customerAddress: string;
    paymentMethod: string;
    paymentStatus: string;
    discountAmount: number;
    shippingFee: number;
    tax: number;
    notes?: string | null;
    discountCode?: string | null;
    total: number;
    subtotal: number;
    version: number;
  } {
    const subtotal = order.items.reduce(
      (sum, item) => sum + item.total.getValue(),
      0,
    );
    return {
      id: order.id,
      userId: order.userId,
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      customerAddress: order.customerAddress,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      discountAmount: order.discountAmount.getValue(),
      shippingFee: order.shippingFee.getValue(),
      tax: order.tax.getValue(),
      notes: order.notes || null,
      discountCode: order.discountCode || null,
      total: order.total.getValue(),
      subtotal: subtotal,
      version: order.version,
    };
  }
}
