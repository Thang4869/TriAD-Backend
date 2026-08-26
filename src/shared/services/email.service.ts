import { emailQueue } from '@core/queue/bull';
import { logger } from '@core/logger/winston';

export class EmailService {
  async sendOrderConfirmation(user: { email: string }, order: { orderNumber: string; total: number }, items: any[]) {
    try {
      await emailQueue.add('order-confirmation', {
        to: user.email,
        subject: `Order #${order.orderNumber} Confirmed`,
        template: 'order-confirmation',
        data: {
          orderNumber: order.orderNumber,
          total: order.total,
          items: items.map(item => ({
            name: item.product.name,
            quantity: item.quantity,
            price: item.price,
          })),
        },
      });
      logger.info(`Order confirmation email enqueued for ${user.email}`);
    } catch (err) {
      logger.error('Failed to enqueue order confirmation email', { orderId: order.orderNumber, error: err });
    }
  }

  async sendVerificationEmail(user: { email: string; firstName: string }, verifyUrl: string) {
    try {
      await emailQueue.add('verify-email', {
        to: user.email,
        subject: 'Xác thực tài khoản TriAD của bạn',
        template: 'verify-email',
        data: { name: user.firstName, verifyUrl },
      });
      logger.info(`Verification email enqueued for ${user.email}`);
    } catch (err) {
      logger.error('Failed to enqueue verification email', { email: user.email, error: err });
    }
  }
}