import crypto from "crypto";
import { Money } from "@shared/value-objects/money";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@shared/utils/errors";
import { ICheckoutRepository, TxClient } from "./checkout.repository";
import { PricingService } from "./domain/pricing.service";
import { StockReservationService } from "./services/stock-reservation.service";
import { IdempotencyService } from "./services/idempotency.service";
import { Order } from "@modules/orders/domain/order.entity";

export interface CheckoutInput {
  idempotencyKey?: string;
  paymentMethod: "COD" | "CARD" | "BANKING";
  address: string;
  phone: string;
  notes?: string;
  discountCode?: string;
}

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 100;

export class CheckoutService {
  constructor(
    private readonly repository: ICheckoutRepository,
    private readonly pricingService: PricingService,
    private readonly stockService: StockReservationService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async checkout(userId: string, input: CheckoutInput) {
    if (input.idempotencyKey) {
      const idempotentResult =
        await this.idempotencyService.tryReturnIdempotentOrder(
          input.idempotencyKey,
        );
      if (idempotentResult) return idempotentResult;
    }

    const user = await this.repository.findUserCartForCheckout(userId);
    if (!user || !user.cart || user.cart.items.length === 0) {
      throw new BadRequestError("Cart is empty");
    }

    const cart = user.cart;

    const persistedOrder = await this.executeWithRetry(async (tx) => {
      await this.stockService.reserveStock(tx, cart.items);

      const order = Order.create({
        id: crypto.randomUUID(),
        userId,
        orderNumber: `ORD-${Date.now().toString(36).toUpperCase()}`,
        customerName: `${user.firstName} ${user.lastName}`,
        customerEmail: user.email,
        customerPhone: input.phone || user.phone || "",
        customerAddress: input.address,
        paymentMethod: input.paymentMethod,
        notes: input.notes,
      });

      for (const item of cart.items) {
        order.addItem(
          item.productId,
          item.product.name,
          item.quantity,
          new Money(item.product.price),
        );
      }

      const pricing = await this.pricingService.calculatePricing(
        order.subtotal,
        input.discountCode,
        tx,
      );
      order.applyPricing(pricing);
      order.place();

      await this.repository.saveNewOrder(tx, order, input.idempotencyKey || "");
      await this.repository.clearCartItems(tx, cart.id);
      return order;
    });

    const fullOrder = await this.repository.findOrderWithItems(
      persistedOrder.id,
    );
    if (!fullOrder) throw new Error("Failed to retrieve created order");

    if (input.idempotencyKey) {
      await this.idempotencyService.cacheOrderId(
        input.idempotencyKey,
        persistedOrder.id,
      );
    }

    return { order: fullOrder, idempotent: false };
  }

  async getOrder(orderId: string, userId: string) {
    const order = await this.repository.findOrderByUserAndId(orderId, userId);
    if (!order) throw new NotFoundError("Order not found");
    return order;
  }

  async getOrders(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      this.repository.findOrdersByUser(userId, skip, limit),
      this.repository.countOrdersByUser(userId),
    ]);
    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async executeWithRetry<T>(
    operation: (tx: TxClient) => Promise<T>,
    retryCount = 0,
  ): Promise<T> {
    try {
      return await this.repository.runInTransaction(operation);
    } catch (error) {
      if (error instanceof ConflictError && retryCount < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, retryCount);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeWithRetry(operation, retryCount + 1);
      }
      throw error;
    }
  }
}
