import redis from "@core/redis/client";
import { logger } from "@core/logger/winston";
import { Queue, Worker, QueueEvents } from "bullmq";
import { queueJobsWaiting, queueJobsFailed } from "@core/metrics/metrics.registry";

export const emailQueue = new Queue("email", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export const imageQueue = new Queue("image", {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 5000 },
  },
});

const queueEvents = new QueueEvents("email", { connection: redis });
queueEvents.on("completed", ({ jobId, returnvalue }) => {
  logger.info("Job completed", { jobId, returnvalue });
});
queueEvents.on("failed", ({ jobId, failedReason }) => {
  logger.error("Job failed", { jobId, failedReason });
});

export const emailWorker = new Worker("email", async (job) => {
    const { to, subject, template, data } = job.data;
    logger.info("Sending email", { to, subject });
  },
  { connection: redis, concurrency: 5 },
);

export const imageWorker = new Worker("image", async (job) => {
    const { productId, imageUrl } = job.data;
    logger.info("Processing image", { productId, imageUrl });
  },
  { connection: redis, concurrency: 2 },
);

export const queues = {email: emailQueue, image: imageQueue};

const QUEUE_METRICS_POLL_INTERVAL_MS = 15_000;

async function reportQueueMetrics(): Promise<void> {
  for (const [name, queue] of [
    ["image", imageQueue],
    ["email", emailQueue],
  ] as const) {
    const counts = await queue.getJobCounts("waiting", "failed");
    queueJobsWaiting.set({ queue_name: name }, counts.waiting ?? 0);
    if (counts.failed) {
      queueJobsFailed.inc({ queue_name: name }, 0);
    }
  }
}

const imageQueueEvents = new QueueEvents("image", { connection: redis });
imageQueueEvents.on("failed", ({ jobId, failedReason }) => {
  queueJobsFailed.inc({ queue_name: "image" });
  logger.error("Image job failed", { jobId, failedReason });
});

const emailQueueEvents = new QueueEvents("email", { connection: redis });
emailQueueEvents.on("failed", ({ jobId, failedReason }) => {
  queueJobsFailed.inc({ queue_name: "email" });
  logger.error("Email job failed", { jobId, failedReason });
});

setInterval(reportQueueMetrics, QUEUE_METRICS_POLL_INTERVAL_MS).unref();