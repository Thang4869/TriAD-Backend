import { NotFoundError } from "@shared/utils/errors";
import { OrderStatus } from "@prisma/client";
import {
  IOrdersRepository,
  PrismaOrdersRepository,
  AdminOrderFilters,
} from "./orders.repository";

export class OrdersService {
  constructor(
    private readonly repository: IOrdersRepository = new PrismaOrdersRepository(),
  ) {}

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
