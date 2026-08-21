import { Queue, Worker, QueueEvents } from "bullmq";
import redis from "@core/redis/client";
import { logger } from "@core/logger/winston";

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

// Worker for email jobs
export const emailWorker = new Worker(
  "email",
  async (job) => {
    // Email sending logic will be imported separately
    const { to, subject, template, data } = job.data;
    // ... send email
    logger.info("Sending email", { to, subject });
  },
  { connection: redis, concurrency: 5 },
);

export const imageWorker = new Worker(
  "image",
  async (job) => {
    // Image processing logic
    const { productId, imageUrl } = job.data;
    logger.info("Processing image", { productId, imageUrl });
  },
  { connection: redis, concurrency: 2 },
);

export const queues = {
  email: emailQueue,
  image: imageQueue,
};
