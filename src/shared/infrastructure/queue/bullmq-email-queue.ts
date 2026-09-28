import { emailQueue } from "@core/queue/bull";
import { EmailQueuePort } from "@shared/application/ports/email-queue.port";

export class BullMqEmailQueue implements EmailQueuePort {
  async enqueue(
    jobName: string,
    payload: Record<string, unknown>,
    options?: {
      idempotencyKey?: string;
    },
  ): Promise<void> {
    await emailQueue.add(
      jobName,
      payload,
      options?.idempotencyKey ? { jobId: options.idempotencyKey } : undefined,
    );
  }
}
