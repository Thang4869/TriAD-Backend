import prisma from "@core/database/prisma";
import { Prisma, OrderStatus as PrismaOrderStatus } from "@prisma/client";
import {
  AdminOrderFilters,
  AdminOrderView,
  IOrdersRepository,
  OrderView,
} from "../../application/ports/orders.repository.port";
import { OrderStatus } from "../../domain/order-status";

export class PrismaOrdersRepository implements IOrdersRepository {
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

  async updateStatus(orderId: string, status: OrderStatus): Promise<OrderView> {
    const order = await prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        status: status as PrismaOrderStatus,
      },
      include: {
        items: PrismaOrdersRepository.ITEM_INCLUDE,
      },
    });

    return this.toOrderView(order);
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
