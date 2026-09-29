import prisma from "@core/database/prisma";
import { Order, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { persistDomainEvents } from "@core/outbox/persist-domain-events";
import type {
  DiscountRecord,
  ICheckoutRepository,
  LockedProductRow,
} from "../../application/ports/checkout.repository.port";
import type { CheckoutTransaction } from "../../application/ports/checkout-transaction";
import type {
  OrderWithItems,
  UserCartForCheckout,
} from "../../application/ports/checkout-models";
import type { Order as OrderAggregate } from "@modules/orders/domain/order.entity";

const TRANSACTION_TIMEOUT_MS = 10_000;

function toPrismaTx(tx: CheckoutTransaction): Prisma.TransactionClient {
  return tx as unknown as Prisma.TransactionClient;
}

interface CreateOrderData {
  orderNumber: string;
  userId: string;
  status: "PENDING";
  paymentMethod: "COD";
  paymentStatus: "PENDING";
  subtotal: number;
  tax: number;
  shippingFee: number;
  total: number;
  discountAmount: number;
  discountCode?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  notes?: string;
  idempotencyKey?: string;
}

interface CreateOrderItemData {
  orderId: string;
  productId: string;
  quantity: number;
  price: number;
  total: number;
}

// ---------- Prisma implementation ----------

export class PrismaCheckoutRepository implements ICheckoutRepository {
  async findOrderWithItems(orderId: string): Promise<OrderWithItems | null> {
    return prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    }) as unknown as Promise<OrderWithItems | null>;
  }

  async findUserCartForCheckout(
    userId: string,
  ): Promise<UserCartForCheckout | null> {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        cart: {
          include: { items: { include: { product: true } } },
        },
      },
    });
  }

  async runInTransaction<T>(
    fn: (tx: CheckoutTransaction) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(
      (tx) => fn(tx as unknown as CheckoutTransaction),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
    );
  }

  async lockProductsForUpdate(
    tx: CheckoutTransaction,
    productIds: string[],
  ): Promise<LockedProductRow[]> {
    const prismaTx = toPrismaTx(tx);
    return prismaTx.$queryRaw<LockedProductRow[]>`
      SELECT id, stock, version, name, price
      FROM products
      WHERE id = ANY(${productIds})
      FOR UPDATE
    `;
  }

  async decrementProductStock(
    tx: CheckoutTransaction,
    productId: string,
    expectedVersion: number,
    quantity: number,
  ): Promise<boolean> {
    const prismaTx = toPrismaTx(tx);
    const result = await prismaTx.product.updateMany({
      where: { id: productId, version: expectedVersion },
      data: {
        stock: { decrement: quantity },
        version: { increment: 1 },
      },
    });
    return result.count > 0;
  }

  async findDiscountByCode(
    tx: CheckoutTransaction,
    code: string,
  ): Promise<DiscountRecord | null> {
    const prismaTx = toPrismaTx(tx);
    return prismaTx.discount.findUnique({ where: { code } });
  }

  async incrementDiscountUsage(
    tx: CheckoutTransaction,
    discountId: string,
    maxUses: number | null,
  ): Promise<boolean> {
    const prismaTx = toPrismaTx(tx);
    const result = await prismaTx.discount.updateMany({
      where: {
        id: discountId,
        ...(maxUses != null ? { usedCount: { lt: maxUses } } : {}),
      },
      data: { usedCount: { increment: 1 } },
    });
    return result.count > 0;
  }

  async createOrder(
    tx: CheckoutTransaction,
    data: CreateOrderData,
  ): Promise<Order> {
    const prismaTx = toPrismaTx(tx);
    return prismaTx.order.create({ data });
  }

  async saveNewOrder(
    tx: CheckoutTransaction,
    order: OrderAggregate,
    idempotencyKey?: string,
  ): Promise<Order> {
    const prismaTx = toPrismaTx(tx);
    const created = await prismaTx.order.create({
      data: {
        id: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        status: order.status,
        paymentMethod: order.paymentMethod as PaymentMethod,
        paymentStatus: order.paymentStatus as PaymentStatus,
        subtotal: order.subtotal.getValue(),
        tax: order.tax.getValue(),
        shippingFee: order.shippingFee.getValue(),
        total: order.total.getValue(),
        discountAmount: order.discountAmount.getValue(),
        discountCode: order.discountCode,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        customerAddress: order.customerAddress,
        notes: order.notes,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
    });

    await prismaTx.orderItem.createMany({
      data: order.items.map((item) => ({
        orderId: created.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.unitPrice.getValue(),
        total: item.total.getValue(),
      })),
    });

    await persistDomainEvents(toPrismaTx(tx), [order]);

    return created;
  }

  async createOrderItems(
    tx: CheckoutTransaction,
    items: CreateOrderItemData[],
  ): Promise<void> {
    const prismaTx = toPrismaTx(tx);
    await prismaTx.orderItem.createMany({ data: items });
  }

  async clearCartItems(tx: CheckoutTransaction, cartId: string): Promise<void> {
    const prismaTx = toPrismaTx(tx);
    await prismaTx.cartItem.deleteMany({ where: { cartId } });
  }

  async findOrdersByUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<OrderWithItems[]> {
    return prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, images: true, slug: true },
            },
          },
        },
      },
    }) as unknown as Promise<OrderWithItems[]>;
  }

  async countOrdersByUser(userId: string): Promise<number> {
    return prisma.order.count({ where: { userId } });
  }

  async findOrderByUserAndId(
    orderId: string,
    userId: string,
  ): Promise<OrderWithItems | null> {
    return prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, images: true, slug: true },
            },
          },
        },
      },
    }) as unknown as Promise<OrderWithItems | null>;
  }
}
