import { NotFoundError } from "@shared/utils/errors";
import { OrderStatus } from "./domain/order-status";
import {
  IOrdersRepository,
  AdminOrderFilters,
  OrderView,
  AdminOrderView,
} from "./application/ports/orders.repository.port";
import { Order } from "./domain/order.entity";
import {
  OrderHistoryReadPort,
  OrderHistoryView,
} from "./application/order-history-read.port";

export interface IOrdersService {
  getOrders(
    userId: string,
    page?: number,
    limit?: number,
  ): Promise<{
    orders: OrderHistoryView[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  getOrderById(orderId: string, userId: string): Promise<OrderHistoryView>;
  adminGetOrders(
    filters: AdminOrderFilters,
    page?: number,
    limit?: number,
  ): Promise<{
    orders: AdminOrderView[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  updateOrderStatus(orderId: string, status: OrderStatus): Promise<OrderView>;
}

export class OrdersService implements IOrdersService {
  private readonly readPort: OrderHistoryReadPort;

  constructor(
    private readonly repository: IOrdersRepository,
    readPort: OrderHistoryReadPort,
  ) {
    this.readPort = readPort;
  }

  async getOrders(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      this.readPort.findByUser(userId, skip, limit),
      this.readPort.countByUser(userId),
    ]);

    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getOrderById(orderId: string, userId: string) {
    const order = await this.readPort.findByIdAndUser(orderId, userId);
    if (!order) {
      throw new NotFoundError("Order not found");
    }
    return order;
  }

  async adminGetOrders(filters: AdminOrderFilters, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      this.repository.findManyAdmin(filters, skip, limit),
      this.repository.countAdmin(filters),
    ]);

    return { orders, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateOrderStatus(orderId: string, status: OrderStatus) {
    const persisted = await this.repository.findById(orderId);

    if (!persisted) {
      throw new NotFoundError("Order not found");
    }

    const order = Order.hydrate({
      id: persisted.id,
      userId: persisted.userId,
      orderNumber: persisted.orderNumber,
      status: persisted.status,
      createdAt: persisted.createdAt,
      customerName: persisted.customerName,
      customerEmail: persisted.customerEmail,
      customerPhone: persisted.customerPhone,
      customerAddress: persisted.customerAddress,
      paymentMethod: persisted.paymentMethod,
      paymentStatus: persisted.paymentStatus as
        "PENDING" | "PAID" | "FAILED" | "REFUNDED",
      discountAmount: persisted.discountAmount,
      shippingFee: persisted.shippingFee,
      tax: persisted.tax,
      notes: persisted.notes ?? undefined,
      discountCode: persisted.discountCode ?? undefined,
      items: persisted.items.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        quantity: item.quantity,
        price: item.price,
      })),
      version: persisted.version,
    });

    const expectedVersion = order.version;

    switch (status) {
      case OrderStatus.PROCESSING:
        order.confirm();
        break;
      case OrderStatus.SHIPPED:
        order.ship();
        break;
      case OrderStatus.DELIVERED:
        order.deliver();
        break;
      case OrderStatus.CANCELLED:
        order.cancel();
        break;
      default:
        throw new Error(
          `Unsupported order status transition target: ${status}`,
        );
    }

    return this.repository.updateStatusWithEvents(
      orderId,
      expectedVersion,
      order,
    );
  }
}
