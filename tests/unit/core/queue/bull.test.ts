import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetJobCounts = vi.fn().mockResolvedValue({ waiting: 5, failed: 1 });
const queueEventsListeners: Record<
  string,
  Array<(...args: any[]) => void>
> = {};

vi.mock("bullmq", () => {
  class MockQueue {
    name: string;
    options: any;
    getJobCounts = mockGetJobCounts;
    constructor(name: string, options: any) {
      this.name = name;
      this.options = options;
    }
  }
  class MockQueueEvents {
    name: string;
    constructor(name: string) {
      this.name = name;
      if (!queueEventsListeners[name]) {
        queueEventsListeners[name] = [];
      }
    }
    on(event: string, cb: (...args: any[]) => void) {
      queueEventsListeners[this.name].push(cb);
      (this as any)[`__${event}`] = cb;
    }
  }
  class MockWorker {
    name: string;
    processor: (job: any) => Promise<void>;
    options: any;
    constructor(
      name: string,
      processor: (job: any) => Promise<void>,
      options: any,
    ) {
      this.name = name;
      this.processor = processor;
      this.options = options;
    }
  }
  return {
    Queue: MockQueue,
    Worker: MockWorker,
    QueueEvents: MockQueueEvents,
  };
});

vi.mock("@core/redis/client", () => ({ default: { fake: "redis" } }));
vi.mock("@core/logger/winston", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@core/metrics/metrics.registry", () => ({
  queueJobsWaiting: { set: vi.fn() },
  queueJobsFailed: { inc: vi.fn() },
}));

describe("Bull queue setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    for (const key of Object.keys(queueEventsListeners)) {
      delete queueEventsListeners[key];
    }
  });

  it("creates email and image queues with the expected job options", async () => {
    const { emailQueue, imageQueue, queues } = await import("@core/queue/bull");

    expect((emailQueue as any).name).toBe("email");
    expect((emailQueue as any).options.defaultJobOptions).toMatchObject({
      attempts: 3,
      removeOnComplete: true,
      removeOnFail: false,
    });

    expect((imageQueue as any).name).toBe("image");
    expect((imageQueue as any).options.defaultJobOptions).toMatchObject({
      attempts: 2,
    });

    expect(queues).toEqual({ email: emailQueue, image: imageQueue });
  });

  it("creates email and image workers with correct concurrency", async () => {
    const { emailWorker, imageWorker } = await import("@core/queue/bull");

    expect((emailWorker as any).name).toBe("email");
    expect((emailWorker as any).options.concurrency).toBe(5);
    expect((imageWorker as any).name).toBe("image");
    expect((imageWorker as any).options.concurrency).toBe(2);
  });

  it("email worker processor logs when sending an email", async () => {
    const { logger } = await import("@core/logger/winston");
    const { emailWorker } = await import("@core/queue/bull");

    await (emailWorker as any).processor({
      data: { to: "user@test.com", subject: "Hi", _template: "t", _data: {} },
    });

    expect(logger.info).toHaveBeenCalledWith("Sending email", {
      to: "user@test.com",
      subject: "Hi",
    });
  });

  it("image worker processor logs when processing an image", async () => {
    const { logger } = await import("@core/logger/winston");
    const { imageWorker } = await import("@core/queue/bull");

    await (imageWorker as any).processor({
      data: { productId: "p1", imageUrl: "https://cdn/img.jpg" },
    });

    expect(logger.info).toHaveBeenCalledWith("Processing image", {
      productId: "p1",
      imageUrl: "https://cdn/img.jpg",
    });
  });

  it("logs a completed email job via QueueEvents", async () => {
    const { logger } = await import("@core/logger/winston");
    await import("@core/queue/bull");

    const completedHandler = queueEventsListeners["email"]?.[0];
    expect(completedHandler).toBeDefined();
    completedHandler?.({ jobId: "job-1", returnvalue: "ok" });

    expect(logger.info).toHaveBeenCalledWith("Job completed", {
      jobId: "job-1",
      returnvalue: "ok",
    });
  });

  it("logs a failed email job via QueueEvents", async () => {
    const { logger } = await import("@core/logger/winston");
    await import("@core/queue/bull");

    const failedHandler = queueEventsListeners["email"]?.[1];
    expect(failedHandler).toBeDefined();
    failedHandler?.({ jobId: "job-2", failedReason: "boom" });

    expect(logger.error).toHaveBeenCalledWith("Job failed", {
      jobId: "job-2",
      failedReason: "boom",
    });
  });

  it("increments queueJobsFailed and logs when an image job fails", async () => {
    const { logger } = await import("@core/logger/winston");
    const { queueJobsFailed } = await import("@core/metrics/metrics.registry");
    await import("@core/queue/bull");

    const imageFailedHandler = queueEventsListeners["image"]?.[0];
    expect(imageFailedHandler).toBeDefined();
    imageFailedHandler?.({ jobId: "img-1", failedReason: "disk full" });

    expect(queueJobsFailed.inc).toHaveBeenCalledWith({ queue_name: "image" });
    expect(logger.error).toHaveBeenCalledWith("Image job failed", {
      jobId: "img-1",
      failedReason: "disk full",
    });
  });

  it("increments queueJobsFailed and logs when an email job fails (second listener)", async () => {
    const { logger } = await import("@core/logger/winston");
    const { queueJobsFailed } = await import("@core/metrics/metrics.registry");
    await import("@core/queue/bull");

    const emailFailedHandlers = queueEventsListeners["email"]?.filter(
      (_, idx) => idx > 0,
    );
    const secondFailedHandler =
      emailFailedHandlers?.[emailFailedHandlers.length - 1];
    expect(secondFailedHandler).toBeDefined();
    secondFailedHandler?.({ jobId: "mail-1", failedReason: "smtp down" });

    expect(queueJobsFailed.inc).toHaveBeenCalledWith({ queue_name: "email" });
    expect(logger.error).toHaveBeenCalledWith("Email job failed", {
      jobId: "mail-1",
      failedReason: "smtp down",
    });
  });

  it("reports queue metrics for both queues on the polling interval", async () => {
    vi.useFakeTimers();
    try {
      const { queueJobsWaiting, queueJobsFailed } =
        await import("@core/metrics/metrics.registry");
      await import("@core/queue/bull");

      await vi.advanceTimersByTimeAsync(15_000);

      expect(queueJobsWaiting.set).toHaveBeenCalledWith(
        { queue_name: "image" },
        5,
      );
      expect(queueJobsWaiting.set).toHaveBeenCalledWith(
        { queue_name: "email" },
        5,
      );
      expect(queueJobsFailed.inc).toHaveBeenCalledWith(
        { queue_name: "image" },
        0,
      );
      expect(queueJobsFailed.inc).toHaveBeenCalledWith(
        { queue_name: "email" },
        0,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not increment failed metric when there are no failed jobs", async () => {
    vi.useFakeTimers();
    mockGetJobCounts.mockResolvedValueOnce({ waiting: 0, failed: 0 });
    mockGetJobCounts.mockResolvedValueOnce({ waiting: 0, failed: 0 });
    try {
      const { queueJobsWaiting, queueJobsFailed } =
        await import("@core/metrics/metrics.registry");
      await import("@core/queue/bull");

      await vi.advanceTimersByTimeAsync(15_000);

      expect(queueJobsWaiting.set).toHaveBeenCalledWith(
        { queue_name: "image" },
        0,
      );
      expect(queueJobsFailed.inc).not.toHaveBeenCalledWith(
        { queue_name: "image" },
        0,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
