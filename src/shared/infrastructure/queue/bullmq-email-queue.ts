import { emailQueue } from "@core/queue/bull";
import { EmailQueuePort } from "@shared/application/ports/email-queue.port";

export class BullMqEmailQueue implements EmailQueuePort {
  async enqueue(
    jobName: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await emailQueue.add(jobName, payload);
  }
}
