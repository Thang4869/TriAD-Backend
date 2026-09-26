import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mockGetJobCounts = vi.fn();
const mockProcessEmail = vi.fn();

const queueEventsListeners: Record<
  string,
  Record<string, Array<(...args: any[]) => void>>
> = {};

const createdWorkers: Array<{
  name: string;
  processor: (...args: any[]) => unknown;
  options: any;
  close: ReturnType<typeof vi.fn>;
}> = [];

const createdQueueEvents: Array<{
  name: string;
  close: ReturnType<typeof vi.fn>;
}> = [];

const createdQueues: Array<{
  name: string;
  close: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("bullmq", () => {
  class MockQueue {
    name: string;
    options: any;
    getJobCounts = mockGetJobCounts;
    close = vi.fn().mockResolvedValue(undefined);

    constructor(name: string, options: any) {
      this.name = name;
      this.options = options;
      createdQueues.push(this);
    }
  }

  class MockQueueEvents {
    name: string;
    close = vi.fn().mockResolvedValue(undefined);

    constructor(name: string) {
      this.name = name;

      if (!queueEventsListeners[name]) {
        queueEventsListeners[name] = {};
      }

      createdQueueEvents.push(this);
    }

    on(event: string, callback: (...args: any[]) => void) {
      const listeners = queueEventsListeners[this.name];

      if (!listeners[event]) {
        listeners[event] = [];
      }

      listeners[event].push(callback);

      return this;
    }
  }

  class MockWorker {
    name: string;
    processor: (...args: any[]) => unknown;
    options: any;
    close = vi.fn().mockResolvedValue(undefined);

    constructor(
      name: string,
      processor: (...args: any[]) => unknown,
      options: any,
    ) {
      this.name = name;
      this.processor = processor;
      this.options = options;

      createdWorkers.push(this);
    }
  }

  return {
    Queue: MockQueue,
    QueueEvents: MockQueueEvents,
    Worker: MockWorker,
  };
});

vi.mock("@core/redis/client", () => ({
  default: { fake: "redis" },
}));

vi.mock("@core/logger/winston", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@core/metrics/metrics.registry", () => ({
  queueJobsWaiting: {
    set: vi.fn(),
  },
  queueJobsFailed: {
    inc: vi.fn(),
  },
}));

vi.mock("@/jobs/email.job", () => ({
  processEmail: mockProcessEmail,
}));

describe("Bull queue infrastructure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockGetJobCounts.mockResolvedValue({
      waiting: 5,
      failed: 1,
    });

    createdWorkers.length = 0;
    createdQueueEvents.length = 0;
    createdQueues.length = 0;

    for (const key of Object.keys(queueEventsListeners)) {
      delete queueEventsListeners[key];
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates email and image queues with expected options", async () => {
    const { emailQueue, imageQueue, queues } = await import("@core/queue/bull");

    expect((emailQueue as any).name).toBe("email");
    expect((emailQueue as any).options.defaultJobOptions).toMatchObject({
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

    expect((imageQueue as any).name).toBe("image");
    expect((imageQueue as any).options.defaultJobOptions).toMatchObject({
      attempts: 2,
      backoff: {
        type: "fixed",
        delay: 5000,
      },
    });

    expect(queues).toEqual({
      email: emailQueue,
      image: imageQueue,
    });
  });

  it("does not start workers when module is only imported", async () => {
    await import("@core/queue/bull");

    expect(createdWorkers).toHaveLength(0);
    expect(createdQueueEvents).toHaveLength(0);
  });

  it("starts email and image workers with expected processors and concurrency", async () => {
    const imageProcessor = vi.fn();

    const { startQueueInfrastructure } = await import("@core/queue/bull");

    startQueueInfrastructure(imageProcessor);

    expect(createdWorkers).toHaveLength(2);

    const emailWorker = createdWorkers.find(
      (worker) => worker.name === "email",
    );
    const imageWorker = createdWorkers.find(
      (worker) => worker.name === "image",
    );

    expect(emailWorker).toBeDefined();
    expect(emailWorker?.processor).toBe(mockProcessEmail);
    expect(emailWorker?.options.concurrency).toBe(5);

    expect(imageWorker).toBeDefined();
    expect(imageWorker?.processor).toBe(imageProcessor);
    expect(imageWorker?.options.concurrency).toBe(2);
  });

  it("does not start queue infrastructure twice", async () => {
    const imageProcessor = vi.fn();

    const { startQueueInfrastructure } = await import("@core/queue/bull");

    startQueueInfrastructure(imageProcessor);
    startQueueInfrastructure(imageProcessor);

    expect(createdWorkers).toHaveLength(2);
    expect(createdQueueEvents).toHaveLength(2);
  });

  it("logs completed email jobs", async () => {
    const { logger } = await import("@core/logger/winston");
    const { startQueueInfrastructure } = await import("@core/queue/bull");

    startQueueInfrastructure(vi.fn());

    const completedHandler = queueEventsListeners.email?.completed?.[0];

    expect(completedHandler).toBeDefined();

    completedHandler?.({
      jobId: "job-1",
      returnvalue: "ok",
    });

    expect(logger.info).toHaveBeenCalledWith("Email job completed", {
      jobId: "job-1",
      returnvalue: "ok",
    });
  });

  it("records and logs failed email jobs", async () => {
    const { logger } = await import("@core/logger/winston");
    const { queueJobsFailed } = await import("@core/metrics/metrics.registry");
    const { startQueueInfrastructure } = await import("@core/queue/bull");

    startQueueInfrastructure(vi.fn());

    const failedHandler = queueEventsListeners.email?.failed?.[0];

    expect(failedHandler).toBeDefined();

    failedHandler?.({
      jobId: "mail-1",
      failedReason: "smtp down",
    });

    expect(queueJobsFailed.inc).toHaveBeenCalledWith({
      queue_name: "email",
    });

    expect(logger.error).toHaveBeenCalledWith("Email job failed", {
      jobId: "mail-1",
      failedReason: "smtp down",
    });
  });

  it("records and logs failed image jobs", async () => {
    const { logger } = await import("@core/logger/winston");
    const { queueJobsFailed } = await import("@core/metrics/metrics.registry");
    const { startQueueInfrastructure } = await import("@core/queue/bull");

    startQueueInfrastructure(vi.fn());

    const failedHandler = queueEventsListeners.image?.failed?.[0];

    expect(failedHandler).toBeDefined();

    failedHandler?.({
      jobId: "image-1",
      failedReason: "processing failed",
    });

    expect(queueJobsFailed.inc).toHaveBeenCalledWith({
      queue_name: "image",
    });

    expect(logger.error).toHaveBeenCalledWith("Image job failed", {
      jobId: "image-1",
      failedReason: "processing failed",
    });
  });

  it("reports waiting queue metrics on polling interval", async () => {
    vi.useFakeTimers();

    const { queueJobsWaiting } = await import("@core/metrics/metrics.registry");
    const { startQueueInfrastructure } = await import("@core/queue/bull");

    startQueueInfrastructure(vi.fn());

    await vi.advanceTimersByTimeAsync(15_000);

    expect(queueJobsWaiting.set).toHaveBeenCalledWith(
      { queue_name: "image" },
      5,
    );

    expect(queueJobsWaiting.set).toHaveBeenCalledWith(
      { queue_name: "email" },
      5,
    );
  });

  it("uses zero when waiting count is missing", async () => {
    vi.useFakeTimers();

    mockGetJobCounts.mockResolvedValue({
      failed: 0,
    });

    const { queueJobsWaiting } = await import("@core/metrics/metrics.registry");
    const { startQueueInfrastructure } = await import("@core/queue/bull");

    startQueueInfrastructure(vi.fn());

    await vi.advanceTimersByTimeAsync(15_000);

    expect(queueJobsWaiting.set).toHaveBeenCalledWith(
      { queue_name: "image" },
      0,
    );

    expect(queueJobsWaiting.set).toHaveBeenCalledWith(
      { queue_name: "email" },
      0,
    );
  });

  it("logs queue metric collection failures without crashing", async () => {
    vi.useFakeTimers();

    mockGetJobCounts.mockRejectedValue(new Error("Redis unavailable"));

    const { logger } = await import("@core/logger/winston");
    const { startQueueInfrastructure } = await import("@core/queue/bull");

    startQueueInfrastructure(vi.fn());

    await vi.advanceTimersByTimeAsync(15_000);

    expect(logger.error).toHaveBeenCalledWith(
      "Failed to collect queue metrics",
      expect.objectContaining({
        error: expect.any(Error),
      }),
    );
  });

  it("closes workers, QueueEvents and queues on shutdown", async () => {
    const { startQueueInfrastructure, stopQueueInfrastructure } =
      await import("@core/queue/bull");

    startQueueInfrastructure(vi.fn());

    const workers = [...createdWorkers];
    const queueEvents = [...createdQueueEvents];
    const queues = [...createdQueues];

    await stopQueueInfrastructure();

    for (const worker of workers) {
      expect(worker.close).toHaveBeenCalledOnce();
    }

    for (const queueEvent of queueEvents) {
      expect(queueEvent.close).toHaveBeenCalledOnce();
    }

    for (const queue of queues) {
      expect(queue.close).toHaveBeenCalledOnce();
    }
  });

  it("allows stopQueueInfrastructure to be called when not started", async () => {
    const { stopQueueInfrastructure } = await import("@core/queue/bull");

    await expect(stopQueueInfrastructure()).resolves.toBeUndefined();
  });
});
