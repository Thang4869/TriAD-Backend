export interface EmailQueuePort {
  enqueue(
    jobName: string,
    payload: Record<string, unknown>,
    options?: {
      idempotencyKey?: string;
    },
  ): Promise<void>;
}
