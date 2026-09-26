import { NotFoundError, BadRequestError } from "@shared/utils/errors";
import { OrderStatus } from "./domain/order-status";
import {
  IOrdersRepository,
  AdminOrderFilters,
  OrderView,
  AdminOrderView,
} from "./application/ports/orders.repository.port";
import { Order } from "./domain/order.entity";
import { EventBus } from "@shared/domain/event-bus/event-bus";
import { OrderStatusChangedEvent } from "@shared/domain/events/order-events";
import { logger } from "@core/logger/winston";
import { OrderHistoryReadPort } from "./application/order-history-read.port";

export interface IOrdersService {
  getOrders(
    userId: string,
    page?: number,
    limit?: number,
  ): Promise<{
    orders: OrderView[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  getOrderById(orderId: string, userId: string): Promise<OrderView>;
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
    private readonly eventBus: EventBus,
    readPort: OrderHistoryReadPort = repository,
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

    await this.eventBus
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
