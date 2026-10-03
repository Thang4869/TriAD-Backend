import prisma from "@core/database/prisma";
import { Prisma } from "@prisma/client";

import type { ICheckoutRepository } from "../../application/ports/checkout.repository.port";
import type {
  OrderWithItems,
  SavedCheckoutOrder,
  UserCartForCheckout,
} from "../../application/ports/checkout-models";

import { toSafeMoneyNumber } from "@shared/infrastructure/money-number";

export class PrismaCheckoutRepository implements ICheckoutRepository {
  async findOrderWithItems(orderId: string): Promise<OrderWithItems | null> {
    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    return order ? toOrderWithItems(order) : null;
  }

  async findOrderByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<OrderWithItems | null> {
    const order = await prisma.order.findFirst({
      where: {
        userId,
        idempotencyKey,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    return order ? toOrderWithItems(order) : null;
  }

  async findUserCartForCheckout(
    userId: string,
  ): Promise<UserCartForCheckout | null> {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        cart: {
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      ...user,
      cart: user.cart
        ? {
            ...user.cart,
            items: user.cart.items.map((item) => ({
              ...item,
              product: {
                ...item.product,
                price: toSafeMoneyNumber(item.product.price),
              },
            })),
          }
        : null,
    };
  }

  async findOrdersByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<OrderWithItems[]> {
    const orders = await prisma.order.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take,
      include: {
        items: {
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
        },
      },
    });

    return orders.map(toOrderWithItems);
  }

  async countOrdersByUser(userId: string): Promise<number> {
    return prisma.order.count({
      where: {
        userId,
      },
    });
  }

  async findOrderByUserAndId(
    orderId: string,
    userId: string,
  ): Promise<OrderWithItems | null> {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
      },
      include: {
        items: {
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
        },
      },
    });

    return order ? toOrderWithItems(order) : null;
  }
}

type CheckoutOrderRecord = {
  id: string;
  orderNumber: string;
  userId: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: Prisma.Decimal;
  tax: Prisma.Decimal;
  shippingFee: Prisma.Decimal;
  total: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  discountCode: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  notes: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  items: Array<{
    id: string;
    orderId: string;
    productId: string;
    quantity: number;
    price: Prisma.Decimal;
    total: Prisma.Decimal;
    product: {
      id: string;
      name: string;
      images: string[];
      slug: string;
    };
  }>;
};

function toOrderWithItems(order: CheckoutOrderRecord): OrderWithItems {
  return {
    ...toSavedCheckoutOrder(order),
    items: order.items.map((item) => ({
      ...item,
      price: toSafeMoneyNumber(item.price),
      total: toSafeMoneyNumber(item.total),
    })),
  };
}

function toSavedCheckoutOrder(
  order: Omit<CheckoutOrderRecord, "items"> | CheckoutOrderRecord,
): SavedCheckoutOrder {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    subtotal: toSafeMoneyNumber(order.subtotal),
    tax: toSafeMoneyNumber(order.tax),
    shippingFee: toSafeMoneyNumber(order.shippingFee),
    total: toSafeMoneyNumber(order.total),
    discountAmount: toSafeMoneyNumber(order.discountAmount),
    discountCode: order.discountCode,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    notes: order.notes,
    idempotencyKey: order.idempotencyKey,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    version: order.version,
  };
}
