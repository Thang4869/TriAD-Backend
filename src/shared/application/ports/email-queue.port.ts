export interface EmailQueuePort {
  enqueue(jobName: string, payload: Record<string, unknown>): Promise<void>;
}
