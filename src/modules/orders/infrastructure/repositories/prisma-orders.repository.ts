import prisma from "@core/database/prisma";
import { Prisma, OrderStatus as PrismaOrderStatus } from "@prisma/client";
import {
  AdminOrderFilters,
  AdminOrderView,
  IOrdersRepository,
  OrderView,
} from "../../application/ports/orders.repository.port";
import { OrderStatus } from "../../domain/order-status";
import { Order } from "../../domain/order.entity";
import { persistDomainEvents } from "@core/outbox/persist-domain-events";
import { ConflictError } from "@shared/utils/errors";
type PersistDomainEvents = typeof persistDomainEvents;

export class PrismaOrdersRepository implements IOrdersRepository {
  constructor(
    private readonly persistEvents: PersistDomainEvents = persistDomainEvents,
  ) {}
  private static readonly ITEM_INCLUDE = {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          images: true,
          slug: true,
        },
      },
    },
  } as const;

  async findByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<OrderView[]> {
    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        items: PrismaOrdersRepository.ITEM_INCLUDE,
      },
    });

    return orders.map((order) => this.toOrderView(order));
  }

  async countByUser(userId: string): Promise<number> {
    return prisma.order.count({
      where: { userId },
    });
  }

  async findByIdAndUser(
    orderId: string,
    userId: string,
  ): Promise<OrderView | null> {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
      },
      include: {
        items: PrismaOrdersRepository.ITEM_INCLUDE,
      },
    });

    return order ? this.toOrderView(order) : null;
  }

  async findManyAdmin(
    filters: AdminOrderFilters,
    skip: number,
    take: number,
  ): Promise<AdminOrderView[]> {
    const where: Prisma.OrderWhereInput = {
      ...(filters.status && {
        status: filters.status as PrismaOrderStatus,
      }),
      ...(filters.userId && {
        userId: filters.userId,
      }),
    };

    const orders = await prisma.order.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: PrismaOrdersRepository.ITEM_INCLUDE,
      },
    });

    return orders.map((order) => ({
      ...this.toOrderView(order),
      user: order.user,
    }));
  }

  async countAdmin(filters: AdminOrderFilters): Promise<number> {
    const where: Prisma.OrderWhereInput = {
      ...(filters.status && {
        status: filters.status as PrismaOrderStatus,
      }),
      ...(filters.userId && {
        userId: filters.userId,
      }),
    };

    return prisma.order.count({ where });
  }

  async findById(orderId: string): Promise<OrderView | null> {
    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        items: PrismaOrdersRepository.ITEM_INCLUDE,
      },
    });

    return order ? this.toOrderView(order) : null;
  }

  async updateStatusWithEvents(
    orderId: string,
    expectedVersion: number,
    aggregate: Order,
  ): Promise<OrderView> {
    return prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: {
          id: orderId,
          version: expectedVersion,
        },
        data: {
          status: aggregate.status as PrismaOrderStatus,
          version: {
            increment: 1,
          },
        },
      });

      if (result.count !== 1) {
        throw new ConflictError(
          "Order was modified by another request. Please retry.",
        );
      }

      await this.persistEvents(
        tx,
        [aggregate],
        new Map([[orderId, expectedVersion + 1]]),
      );

      const updated = await tx.order.findUnique({
        where: {
          id: orderId,
        },
        include: {
          items: PrismaOrdersRepository.ITEM_INCLUDE,
        },
      });

      if (!updated) {
        throw new ConflictError("Order disappeared during status update.");
      }

      return this.toOrderView(updated);
    });
  }

  private toOrderView(
    order: Prisma.OrderGetPayload<{
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true;
                name: true;
                images: true;
                slug: true;
              };
            };
          };
        };
      };
    }>,
  ): OrderView {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: order.status as OrderStatus,
      version: order.version,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      subtotal: order.subtotal,
      tax: order.tax,
      shippingFee: order.shippingFee,
      total: order.total,
      discountAmount: order.discountAmount,
      discountCode: order.discountCode,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      customerAddress: order.customerAddress,
      notes: order.notes,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items.map((item) => ({
        id: item.id,
        orderId: item.orderId,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        product: item.product,
      })),
    };
  }
}
