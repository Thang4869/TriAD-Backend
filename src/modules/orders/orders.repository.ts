import prisma from "@core/database/prisma";
import { Prisma, Order, OrderStatus } from "@prisma/client";

export type OrderWithItems = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        product: { select: { id: true; name: true; images: true; slug: true } };
      };
    };
  };
}>;

export type AdminOrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    user: {
      select: { id: true; email: true; firstName: true; lastName: true };
    };
    items: {
      include: { product: { select: { id: true; name: true; images: true } } };
    };
  };
}>;

export interface AdminOrderFilters {
  status?: OrderStatus;
  userId?: string;
}

// ---------- Repository contract ----------

export interface IOrdersRepository {
  findByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<OrderWithItems[]>;
  countByUser(userId: string): Promise<number>;
  findByIdAndUser(
    orderId: string,
    userId: string,
  ): Promise<OrderWithItems | null>;

  findManyAdmin(
    filters: AdminOrderFilters,
    skip: number,
    take: number,
  ): Promise<AdminOrderWithRelations[]>;
  countAdmin(filters: AdminOrderFilters): Promise<number>;

  findById(orderId: string): Promise<Order | null>;
  updateStatus(orderId: string, status: OrderStatus): Promise<OrderWithItems>;
}

// ---------- Prisma implementation ----------

export class PrismaOrdersRepository implements IOrdersRepository {
  private static readonly ITEM_INCLUDE = {
    include: {
      product: { select: { id: true, name: true, images: true, slug: true } },
    },
  } as const;

  async findByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<OrderWithItems[]> {
    return prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { items: PrismaOrdersRepository.ITEM_INCLUDE },
    }) as unknown as Promise<OrderWithItems[]>;
  }

  async countByUser(userId: string): Promise<number> {
    return prisma.order.count({ where: { userId } });
  }

  async findByIdAndUser(
    orderId: string,
    userId: string,
  ): Promise<OrderWithItems | null> {
    return prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: PrismaOrdersRepository.ITEM_INCLUDE },
    }) as unknown as Promise<OrderWithItems | null>;
  }

  async findManyAdmin(
    filters: AdminOrderFilters,
    skip: number,
    take: number,
  ): Promise<AdminOrderWithRelations[]> {
    const where: Prisma.OrderWhereInput = {
      ...(filters.status && { status: filters.status }),
      ...(filters.userId && { userId: filters.userId }),
    };

    return prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        items: {
          include: {
            product: { select: { id: true, name: true, images: true } },
          },
        },
      },
    });
  }

  async countAdmin(filters: AdminOrderFilters): Promise<number> {
    const where: Prisma.OrderWhereInput = {
      ...(filters.status && { status: filters.status }),
      ...(filters.userId && { userId: filters.userId }),
    };
    return prisma.order.count({ where });
  }

  async findById(orderId: string): Promise<Order | null> {
    return prisma.order.findUnique({ where: { id: orderId } });
  }

  async updateStatus(
    orderId: string,
    status: OrderStatus,
  ): Promise<OrderWithItems> {
    return prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: { items: PrismaOrdersRepository.ITEM_INCLUDE },
    }) as unknown as Promise<OrderWithItems>;
  }
}
