import redis from "@core/redis/client";
import { logger } from "@core/logger/winston";
import { Queue, QueueEvents, Worker, type Processor } from "bullmq";
import {
  queueJobsWaiting,
  queueJobsFailed,
} from "@core/metrics/metrics.registry";
import { processEmail } from "@/jobs/email.job";

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

export const queues = {
  email: emailQueue,
  image: imageQueue,
};

const QUEUE_METRICS_POLL_INTERVAL_MS = 15_000;

let emailWorker: Worker | null = null;
let imageWorker: Worker | null = null;
let emailQueueEvents: QueueEvents | null = null;
let imageQueueEvents: QueueEvents | null = null;
let metricsTimer: NodeJS.Timeout | null = null;
let started = false;

async function reportQueueMetrics(): Promise<void> {
  for (const [name, queue] of [
    ["image", imageQueue],
    ["email", emailQueue],
  ] as const) {
    try {
      const counts = await queue.getJobCounts("waiting", "failed");

      queueJobsWaiting.set({ queue_name: name }, counts.waiting ?? 0);
    } catch (error) {
      logger.error("Failed to collect queue metrics", {
        queue: name,
        error,
      });
    }
  }
}

export function startQueueInfrastructure(imageProcessor: Processor): void {
  if (started) {
    return;
  }

  started = true;

  emailWorker = new Worker("email", processEmail, {
    connection: redis,
    concurrency: 5,
  });

  imageWorker = new Worker("image", imageProcessor, {
    connection: redis,
    concurrency: 2,
  });

  emailQueueEvents = new QueueEvents("email", {
    connection: redis,
  });

  emailQueueEvents.on("completed", ({ jobId, returnvalue }) => {
    logger.info("Email job completed", {
      jobId,
      returnvalue,
    });
  });

  emailQueueEvents.on("failed", ({ jobId, failedReason }) => {
    queueJobsFailed.inc({ queue_name: "email" });

    logger.error("Email job failed", {
      jobId,
      failedReason,
    });
  });

  imageQueueEvents = new QueueEvents("image", {
    connection: redis,
  });

  imageQueueEvents.on("failed", ({ jobId, failedReason }) => {
    queueJobsFailed.inc({ queue_name: "image" });

    logger.error("Image job failed", {
      jobId,
      failedReason,
    });
  });

  metricsTimer = setInterval(() => {
    void reportQueueMetrics();
  }, QUEUE_METRICS_POLL_INTERVAL_MS);

  metricsTimer.unref();

  logger.info("BullMQ infrastructure started");
}

export async function stopQueueInfrastructure(): Promise<void> {
  if (!started) {
    return;
  }

  started = false;

  if (metricsTimer) {
    clearInterval(metricsTimer);
    metricsTimer = null;
  }

  const resources = [
    imageWorker,
    emailWorker,
    imageQueueEvents,
    emailQueueEvents,
  ];

  await Promise.allSettled(
    resources
      .filter((resource): resource is Worker | QueueEvents => resource !== null)
      .map((resource) => resource.close()),
  );

  imageWorker = null;
  emailWorker = null;
  imageQueueEvents = null;
  emailQueueEvents = null;

  await Promise.allSettled([imageQueue.close(), emailQueue.close()]);

  logger.info("BullMQ infrastructure stopped");
}
