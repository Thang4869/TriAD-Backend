import { logger } from "@core/logger/winston";
import {
  withCircuitBreaker,
  withRetry,
} from "@core/circuit-breaker/circuit-breaker";
import { EmailQueuePort } from "@shared/application/ports/email-queue.port";

interface OrderConfirmationItem {
  productName: string;
  quantity: number;
  price: number;
}

export class EmailService {
  private readonly enqueue: (
    jobName: string,
    payload: Record<string, unknown>,
    options?: {
      idempotencyKey?: string;
    },
  ) => Promise<void>;

  constructor(private readonly emailQueue: EmailQueuePort) {
    this.enqueue = withCircuitBreaker(
      (
        jobName: string,
        payload: Record<string, unknown>,
        options?: {
          idempotencyKey?: string;
        },
      ) => this.emailQueue.enqueue(jobName, payload, options),
      {
        name: "email-queue-enqueue",
        timeout: 3000,
        resetTimeout: 15000,
      },
    );
  }

  async sendOrderConfirmation(
    user: { email: string },
    order: { orderNumber: string; total: number },
    items: OrderConfirmationItem[],
    idempotencyKey?: string,
  ): Promise<void> {
    await this.enqueueWithRetry(
      "order-confirmation",
      {
        to: user.email,
        subject: `Order #${order.orderNumber} Confirmed`,
        template: "order-confirmation",
        data: {
          orderNumber: order.orderNumber,
          total: order.total,
          items: items.map((item) => ({
            name: item.productName,
            quantity: item.quantity,
            price: item.price,
          })),
        },
      },
      idempotencyKey,
    );
  }

  async sendVerificationEmail(
    user: { email: string; firstName: string },
    verifyUrl: string,
  ): Promise<void> {
    await this.enqueueWithRetry("verify-email", {
      to: user.email,
      subject: "Xác thực tài khoản TriAD của bạn",
      template: "verify-email",
      data: { name: user.firstName, verifyUrl },
    });
  }

  private async enqueueWithRetry(
    jobName: string,
    payload: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<void> {
    try {
      await withRetry(
        () =>
          this.enqueue(jobName, payload, {
            idempotencyKey,
          }),
        {
          retries: 2,
          minTimeout: 100,
          maxTimeout: 800,
        },
      );

      logger.info(`Email job '${jobName}' enqueued`, {
        to: payload.to,
      });
    } catch (err) {
      logger.error(`Failed to enqueue email job '${jobName}'`, {
        to: payload.to,
        error: err,
      });
      throw err;
    }
  }
}
