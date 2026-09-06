import { NotFoundError, BadRequestError } from "@shared/utils/errors";
import { OrderStatus } from "@prisma/client";
import {
  IOrdersRepository,
  AdminOrderFilters,
  OrderWithItems,
  AdminOrderWithRelations,
} from "./orders.repository";
import { Order } from "./domain/order.entity";
import { EventBus } from "@shared/domain/event-bus/event-bus";
import { OrderStatusChangedEvent } from "@shared/domain/events/order-events";
import { logger } from "@core/logger/winston";

export interface IOrdersService {
  getOrders(
    userId: string,
    page?: number,
    limit?: number,
  ): Promise<{
    orders: OrderWithItems[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  getOrderById(orderId: string, userId: string): Promise<OrderWithItems>;
  adminGetOrders(
    filters: AdminOrderFilters,
    page?: number,
    limit?: number,
  ): Promise<{
    orders: AdminOrderWithRelations[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  updateOrderStatus(
    orderId: string,
    status: OrderStatus,
  ): Promise<OrderWithItems>;
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
    if (!Order.canTransition(order.status, status)) {
      throw new BadRequestError(
        `Cannot transition order from ${order.status} to ${status}`,
      );
    }
    const updated = await this.repository.updateStatus(orderId, status);

    await EventBus.getInstance()
      .publish(
        new OrderStatusChangedEvent(
          orderId,
          order.status,
          status,
          order.userId,
        ),
      )
      .catch((error) =>
        logger.error("Failed to publish OrderStatusChanged", { error }),
      );

    return updated;
  }
}
