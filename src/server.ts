import "@core/tracing/tracing";
import "dotenv/config";
import app from "./app";
import prisma from "@core/database/prisma";
import redis from "@core/redis/client";
import { config } from "./config";
import { logger } from "@core/logger/winston";
import { OutboxRelay } from "@core/outbox/outbox-relay";
import { PrismaOutboxRelayStore } from "@core/outbox/prisma-outbox-relay.store";
import { eventBus, imageJobProcessor } from "@/container";
import { PrismaOutboxHandlerTracker } from "@core/outbox/outbox-handler-tracker";
import { shutdownTracing } from "@core/tracing/tracing";
import {
  startQueueInfrastructure,
  stopQueueInfrastructure,
} from "@core/queue/bull";

const PORT = config.PORT;

const SHUTDOWN_TIMEOUT_MS = 10_000;

const outboxRelay = new OutboxRelay(
  new PrismaOutboxRelayStore(),
  new PrismaOutboxHandlerTracker(),
  eventBus,
);

const startServer = async (): Promise<void> => {
  let databaseConnected = false;
  let redisConnected = false;

  try {
    logger.info("Starting server with config:", {
      NODE_ENV: config.NODE_ENV,
      PORT: config.PORT,
      REDIS_URL: config.REDIS_URL.replace(/\/\/.*@/, "//***@"),
    });

    await prisma.$connect();
    databaseConnected = true;
    logger.info("Database connected successfully");

    await redis.ping();
    redisConnected = true;
    logger.info("Redis connected successfully");

    startQueueInfrastructure(imageJobProcessor);

    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${config.NODE_ENV}`);
      logger.info(`API Docs: http://localhost:${PORT}/api/docs`);
    });

    outboxRelay.start();

    let isShuttingDown = false;

    const shutdown = async (signal: string): Promise<void> => {
      if (isShuttingDown) {
        logger.warn(`Shutdown already in progress, ignoring ${signal}`);
        return;
      }

      isShuttingDown = true;

      logger.info(`Received ${signal}, shutting down gracefully...`);

      const forceShutdownTimer = setTimeout(() => {
        logger.error("Could not close connections gracefully, forcing exit...");
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS);

      forceShutdownTimer.unref();

      try {
        await outboxRelay.stop();

        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });

        logger.info("HTTP server closed");

        await stopQueueInfrastructure();

        await shutdownTracing();

        if (databaseConnected) {
          await prisma.$disconnect();
          databaseConnected = false;
          logger.info("Database disconnected");
        }

        if (redisConnected) {
          await redis.quit();
          redisConnected = false;
          logger.info("Redis disconnected");
        }

        clearTimeout(forceShutdownTimer);

        logger.info("Graceful shutdown completed");
        process.exit(0);
      } catch (error) {
        clearTimeout(forceShutdownTimer);

        logger.error("Error during graceful shutdown:", error);
        process.exit(1);
      }
    };

    process.once("SIGTERM", () => {
      void shutdown("SIGTERM");
    });

    process.once("SIGINT", () => {
      void shutdown("SIGINT");
    });
  } catch (error) {
    logger.error("Failed to start server:", error);

    const cleanupResults = await Promise.allSettled([
      outboxRelay.stop(),
      stopQueueInfrastructure(),
      databaseConnected ? prisma.$disconnect() : Promise.resolve(),
      redisConnected ? redis.quit() : Promise.resolve(),
      shutdownTracing(),
    ]);

    const cleanupFailures = cleanupResults.filter(
      (result) => result.status === "rejected",
    );

    if (cleanupFailures.length > 0) {
      logger.error("Some startup resources failed to clean up", {
        failures: cleanupFailures.map((result) =>
          result.status === "rejected"
            ? result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
            : null,
        ),
      });
    }

    process.exit(1);
  }
};

void startServer();
