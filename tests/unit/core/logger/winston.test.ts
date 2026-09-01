import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Winston logger configuration", () => {
  const OLD_ENV = { ...process.env };

  beforeEach(async () => {
    // Reset module cache để mock được áp dụng sạch sẽ
    vi.resetModules();

    // Mock các module gây phụ thuộc Redis/Bull
    vi.doMock("@core/queue/bull", () => ({
      emailQueue: { add: vi.fn() },
      imageQueue: { add: vi.fn() },
      emailWorker: { close: vi.fn() },
      imageWorker: { close: vi.fn() },
      queues: {},
    }));

    vi.doMock("winston", () => {
      const winstonMock = {
        createLogger: vi.fn().mockReturnValue({
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn(),
          level: "info",
          transports: [],
          on: vi.fn(),
          close: vi.fn(),
        }),
        format: {
          combine: vi.fn().mockReturnValue(vi.fn()),
          timestamp: vi.fn().mockReturnValue(vi.fn()),
          json: vi.fn().mockReturnValue(vi.fn()),
          colorize: vi.fn().mockReturnValue(vi.fn()),
          printf: vi.fn().mockReturnValue(vi.fn()),
        },
        transports: {
          // Sử dụng function truyền thống để hỗ trợ từ khóa `new`
          Console: vi.fn().mockImplementation(function () {
            return {};
          }),
          DailyRotateFile: vi.fn().mockImplementation(function () {
            return {};
          }),
        },
      };

      return {
        ...winstonMock,
        default: winstonMock,
      };
    });

    vi.doMock("winston-daily-rotate-file", () => ({
      default: vi.fn().mockImplementation(function () {
        return {};
      }),
    }));

    // Khôi phục biến môi trường và xóa mock history
    process.env = { ...OLD_ENV };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("falls back to ./logs when LOG_FILE_PATH is not set", async () => {
    delete process.env.LOG_FILE_PATH;
    const winston = await import("winston");
    await import("@core/logger/winston");

    expect(winston.transports.DailyRotateFile).toHaveBeenCalledTimes(1);
    const callArgs = (winston.transports.DailyRotateFile as any).mock
      .calls[0][0];
    expect(callArgs.dirname).toBe("./logs");
  });

  it("uses LOG_FILE_PATH from env when provided", async () => {
    process.env.LOG_FILE_PATH = "/tmp/custom-logs";
    const winston = await import("winston");
    await import("@core/logger/winston");

    expect(winston.transports.DailyRotateFile).toHaveBeenCalledTimes(1);
    const callArgs = (winston.transports.DailyRotateFile as any).mock
      .calls[0][0];
    expect(callArgs.dirname).toBe("/tmp/custom-logs");
  });

  it("falls back to info level when LOG_LEVEL is not set", async () => {
    delete process.env.LOG_LEVEL;
    const winston = await import("winston");
    await import("@core/logger/winston");

    expect(winston.createLogger).toHaveBeenCalledWith(
      expect.objectContaining({ level: "info" }),
    );
  });

  it("uses LOG_LEVEL from env when provided", async () => {
    process.env.LOG_LEVEL = "debug";
    const winston = await import("winston");
    await import("@core/logger/winston");

    expect(winston.createLogger).toHaveBeenCalledWith(
      expect.objectContaining({ level: "debug" }),
    );
  });

  it("formats a log line without extra metadata (empty metaStr branch)", async () => {
    const winston = await import("winston");
    await import("@core/logger/winston");

    const printfCallback = (winston.format.printf as any).mock.calls[0][0];
    const line = printfCallback({
      timestamp: "2026-01-01 00:00:00",
      level: "info",
      message: "hello",
    });

    expect(line).toBe("[2026-01-01 00:00:00] info: hello");
  });

  it("formats a log line with extra metadata (non-empty metaStr branch)", async () => {
    const winston = await import("winston");
    await import("@core/logger/winston");

    const printfCallback = (winston.format.printf as any).mock.calls[0][0];
    const line = printfCallback({
      timestamp: "2026-01-01 00:00:00",
      level: "error",
      message: "boom",
      userId: "u1",
    });

    expect(line).toBe('[2026-01-01 00:00:00] error: boom {"userId":"u1"}');
  });
});
