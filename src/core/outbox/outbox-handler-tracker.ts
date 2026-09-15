import prisma from "@core/database/prisma";
import { logger } from "@core/logger/winston";
import { HandlerExecutionTracker } from "@shared/domain/event-bus/event-bus";

export class PrismaOutboxHandlerTracker implements HandlerExecutionTracker {
  async hasSucceeded(eventId: string, handlerName: string): Promise<boolean> {
    const row = await prisma.outboxHandlerLog.findUnique({
      where: {
        outboxEventId_handlerName: {
          outboxEventId: eventId,
          handlerName,
        },
      },
      select: { status: true },
    });
    return row?.status === "SUCCESS";
  }

  async recordResult(
    eventId: string,
    handlerName: string,
    result: { success: true } | { success: false; error: string },
  ): Promise<void> {
    try {
      await prisma.outboxHandlerLog.upsert({
        where: {
          outboxEventId_handlerName: {
            outboxEventId: eventId,
            handlerName,
          },
        },
        create: {
          outboxEventId: eventId,
          handlerName,
          status: result.success ? "SUCCESS" : "FAILED",
          error: result.success ? null : result.error,
        },
        update: {
          status: result.success ? "SUCCESS" : "FAILED",
          error: result.success ? null : result.error,
          attemptedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error("Failed to record outbox handler result", {
        eventId,
        handlerName,
        error,
      });
    }
  }
}

export const outboxHandlerTracker = new PrismaOutboxHandlerTracker();
