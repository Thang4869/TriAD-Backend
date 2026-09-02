import { NotFoundError } from "@shared/utils/errors";
import { OrderStatus } from "@prisma/client";
import { IOrdersRepository, AdminOrderFilters } from "./orders.repository";

export interface IOrdersService {
  getOrders(
    userId: string,
    page?: number,
    limit?: number,
  ): Promise<{
    orders: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  getOrderById(orderId: string, userId: string): Promise<any>;
  adminGetOrders(
    filters: AdminOrderFilters,
    page?: number,
    limit?: number,
  ): Promise<{
    orders: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  updateOrderStatus(orderId: string, status: OrderStatus): Promise<any>;
}

export class OrdersService implements IOrdersService {
  constructor(private readonly repository: IOrdersRepository) {}

  async getOrders(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      this.repository.findByUser(userId, skip, limit),
      this.repository.countByUser(userId),
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
    const order = await this.repository.findByIdAndUser(orderId, userId);
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
    const order = await this.repository.findById(orderId);
    if (!order) {
      throw new NotFoundError("Order not found");
    }
    return this.repository.updateStatus(orderId, status);
  }
}
