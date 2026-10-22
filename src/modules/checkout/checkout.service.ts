import { Money } from "@shared/value-objects/money";
import {
  ValidationError,
  ConflictError,
  ResourceNotFoundError,
} from "@shared/errors/application-error";
import { ICheckoutRepository } from "./application/ports/checkout.repository.port";
import type {
  CheckoutTransaction,
  CheckoutUnitOfWork,
} from "./application/ports/checkout-transaction";
import { PricingService } from "./services/pricing.service";
import { StockReservationService } from "./services/stock-reservation.service";
import { Order } from "@modules/orders/domain/order.entity";
import { IdempotencyConflictError } from "./application/errors/idempotency-conflict.error";
import { OrderNumberGenerator } from "./application/ports/order-number-generator.port";
import type { TracerPort } from "@shared/application/observability/tracer.port";
import type { MetricsPort } from "@shared/application/observability/metrics.port";

export interface CheckoutInput {
  idempotencyKey?: string;
  paymentMethod: "COD";
  address: string;
  phone: string;
  notes?: string;
  discountCode?: string;
  expectedTotal?: number;
}

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 100;

export class CheckoutService {
  constructor(
    private readonly repository: ICheckoutRepository,
    private readonly unitOfWork: CheckoutUnitOfWork,
    private readonly pricingService: PricingService,
    private readonly stockService: StockReservationService,
    private readonly orderNumberGenerator: OrderNumberGenerator,
    private readonly tracer: TracerPort,
    private readonly metrics: MetricsPort,
  ) {}

  async quote(userId: string, discountCode?: string) {
    const user = await this.repository.findUserCartForCheckout(userId);
    if (!user?.cart?.items.length) throw new ValidationError("Cart is empty");

    let subtotal = new Money(0);
    for (const item of user.cart.items) {
      if (!item.product.isActive || item.product.stock < item.quantity) {
        throw new ValidationError(`Product ${item.productId} is unavailable`);
      }
      subtotal = subtotal.add(
        new Money(item.product.price).multiply(item.quantity),
      );
    }

    const pricing = await this.unitOfWork.run((tx) =>
      this.pricingService.previewPricing(subtotal, discountCode, tx),
    );
    return {
      subtotal: subtotal.getValue(),
      tax: pricing.tax.getValue(),
      shippingFee: pricing.shippingFee.getValue(),
      discountAmount: pricing.discountAmount.getValue(),
      discountCode: pricing.discountCode,
      total: subtotal
        .add(pricing.tax)
        .add(pricing.shippingFee)
        .subtract(pricing.discountAmount)
        .getValue(),
    };
  }

  async checkout(userId: string, input: CheckoutInput) {
    return this.tracer.withSpan(
      "checkout.place_order",
      async (setAttributes) => {
        if (input.idempotencyKey) {
          const existingOrder = await this.repository.findOrderByIdempotencyKey(
            userId,
            input.idempotencyKey,
          );

          if (existingOrder) {
            setAttributes({
              "checkout.order_id": existingOrder.id,
              "checkout.order_number": existingOrder.orderNumber,
              "checkout.idempotent": true,
            });

            return {
              order: existingOrder,
              idempotent: true,
            };
          }
        }

        const user = await this.repository.findUserCartForCheckout(userId);

        if (!user || !user.cart || user.cart.items.length === 0) {
          throw new ValidationError("Cart is empty");
        }

        const cart = user.cart;

        setAttributes({
          "checkout.item_count": cart.items.length,
          "checkout.payment_method": input.paymentMethod,
        });

        let attemptCount = 0;
        let persistedOrder: Order;

        try {
          persistedOrder = await this.executeWithRetry(async (tx) => {
            attemptCount += 1;

            const lockedProducts = await this.stockService.reserveStock(
              tx,
              cart.items,
            );

            const lockedProductMap = new Map(
              lockedProducts.map((product) => [product.id, product]),
            );

            const order = Order.create({
              id: crypto.randomUUID(),
              userId,
              orderNumber: this.orderNumberGenerator.generate(),
              customerName: `${user.firstName} ${user.lastName}`,
              customerEmail: user.email,
              customerPhone: input.phone || user.phone || "",
              customerAddress: input.address,
              paymentMethod: input.paymentMethod,
              notes: input.notes,
            });

            for (const item of cart.items) {
              const product = lockedProductMap.get(item.productId);

              if (!product) {
                throw new ResourceNotFoundError(
                  `Product ${item.productId} not found`,
                );
              }

              order.addItem(
                item.productId,
                product.name,
                item.quantity,
                new Money(product.price),
              );
            }

            const pricing = await this.pricingService.calculatePricing(
              order.subtotal,
              input.discountCode,
              tx,
            );

            order.applyPricing(pricing);
            if (
              input.expectedTotal !== undefined &&
              order.total.getValue() !== input.expectedTotal
            ) {
              throw new ValidationError(
                "Checkout total changed. Refresh the total and review it before placing the order.",
              );
            }
            order.place();

            await tx.saveNewOrder(order, input.idempotencyKey);

            await tx.clearCartItems(cart.id);

            return order;
          });
        } catch (error) {
          if (
            error instanceof IdempotencyConflictError &&
            input.idempotencyKey
          ) {
            const existingOrder =
              await this.repository.findOrderByIdempotencyKey(
                userId,
                input.idempotencyKey,
              );

            if (existingOrder) {
              setAttributes({
                "checkout.order_id": existingOrder.id,
                "checkout.order_number": existingOrder.orderNumber,
                "checkout.idempotent": true,
              });

              return {
                order: existingOrder,
                idempotent: true,
              };
            }
          }

          throw error;
        }

        setAttributes({
          "checkout.order_id": persistedOrder.id,
          "checkout.order_number": persistedOrder.orderNumber,
          "checkout.retry_attempts": attemptCount,
          "checkout.total": persistedOrder.total.getValue(),
        });

        const fullOrder = await this.repository.findOrderWithItems(
          persistedOrder.id,
        );

        if (!fullOrder) {
          throw new Error("Failed to retrieve created order");
        }

        this.metrics.increment("orders.placed");

        return {
          order: fullOrder,
          idempotent: false,
        };
      },
      {
        "checkout.user_id": userId,
      },
    );
  }

  async getOrder(orderId: string, userId: string) {
    const order = await this.repository.findOrderByUserAndId(orderId, userId);

    if (!order) {
      throw new ResourceNotFoundError("Order not found");
    }

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
    operation: (tx: CheckoutTransaction) => Promise<T>,
    retryCount = 0,
  ): Promise<T> {
    try {
      return await this.unitOfWork.run(operation);
    } catch (error) {
      if (error instanceof ConflictError && retryCount < MAX_RETRIES) {
        const exponentialDelay = BASE_DELAY_MS * Math.pow(2, retryCount);

        const jitter = Math.random() * BASE_DELAY_MS;

        const delay = exponentialDelay + jitter;

        await new Promise((resolve) => setTimeout(resolve, delay));

        return this.executeWithRetry(operation, retryCount + 1);
      }

      throw error;
    }
  }
}
