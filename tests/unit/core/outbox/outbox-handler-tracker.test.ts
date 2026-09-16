import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PrismaOutboxHandlerTracker,
  outboxHandlerTracker,
} from "@core/outbox/outbox-handler-tracker";
import prisma from "@core/database/prisma";
import { logger } from "@core/logger/winston";

vi.mock("@core/database/prisma", () => ({
  default: {
    outboxHandlerLog: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@core/logger/winston", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockedPrisma = prisma as unknown as {
  outboxHandlerLog: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
};
const tracker = new PrismaOutboxHandlerTracker();

describe("PrismaOutboxHandlerTracker.hasSucceeded", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tra cứu theo khóa kép (outboxEventId, handlerName)", async () => {
    mockedPrisma.outboxHandlerLog.findUnique.mockResolvedValue(null as never);

    await tracker.hasSucceeded("evt-1", "OrderPlacedHandler");

    expect(mockedPrisma.outboxHandlerLog.findUnique).toHaveBeenCalledWith({
      where: {
        outboxEventId_handlerName: {
          outboxEventId: "evt-1",
          handlerName: "OrderPlacedHandler",
        },
      },
      select: { status: true },
    });
  });

  it("trả true khi status = SUCCESS", async () => {
    mockedPrisma.outboxHandlerLog.findUnique.mockResolvedValue({
      status: "SUCCESS",
    } as never);

    await expect(tracker.hasSucceeded("evt-1", "H")).resolves.toBe(true);
  });

  it("trả false khi lần chạy trước FAILED (cho phép retry)", async () => {
    mockedPrisma.outboxHandlerLog.findUnique.mockResolvedValue({
      status: "FAILED",
    } as never);

    await expect(tracker.hasSucceeded("evt-1", "H")).resolves.toBe(false);
  });

  it("trả false khi chưa có bản ghi nào", async () => {
    mockedPrisma.outboxHandlerLog.findUnique.mockResolvedValue(null as never);

    await expect(tracker.hasSucceeded("evt-1", "H")).resolves.toBe(false);
  });
});

describe("PrismaOutboxHandlerTracker.recordResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.outboxHandlerLog.upsert.mockResolvedValue({} as never);
  });

  it("ghi SUCCESS với error = null", async () => {
    await tracker.recordResult("evt-1", "H", { success: true });

    const arg = mockedPrisma.outboxHandlerLog.upsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ status: "SUCCESS", error: null });
    expect(arg.update).toMatchObject({ status: "SUCCESS", error: null });
  });

  it("ghi FAILED kèm nội dung lỗi", async () => {
    await tracker.recordResult("evt-1", "H", {
      success: false,
      error: "db timeout",
    });

    const arg = mockedPrisma.outboxHandlerLog.upsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ status: "FAILED", error: "db timeout" });
    expect(arg.update).toMatchObject({ status: "FAILED", error: "db timeout" });
  });

  it("cập nhật attemptedAt khi ghi đè bản ghi cũ", async () => {
    await tracker.recordResult("evt-1", "H", { success: true });

    const arg = mockedPrisma.outboxHandlerLog.upsert.mock.calls[0][0];
    expect(arg.update.attemptedAt).toBeInstanceOf(Date);
  });

  it("lỗi khi ghi log không được ném ra ngoài (không làm hỏng luồng xử lý event)", async () => {
    mockedPrisma.outboxHandlerLog.upsert.mockRejectedValue(
      new Error("db down") as never,
    );

    await expect(
      tracker.recordResult("evt-1", "H", { success: true }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to record outbox handler result",
      expect.objectContaining({ eventId: "evt-1", handlerName: "H" }),
    );
  });
});

describe("outboxHandlerTracker (singleton export)", () => {
  it("là một instance của PrismaOutboxHandlerTracker", () => {
    expect(outboxHandlerTracker).toBeInstanceOf(PrismaOutboxHandlerTracker);
  });
});
