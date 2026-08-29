import "@core/tracing/tracing";
import "dotenv/config";
import app from "./app";
import prisma from "@core/database/prisma";
import redis from "@core/redis/client";
import { config } from "./config";
import { logger } from "@core/logger/winston";

const PORT = config.PORT;

const startServer = async () => {
  try {
    logger.info("Starting server with config:", {
      NODE_ENV: config.NODE_ENV,
      PORT: config.PORT,
      REDIS_URL: config.REDIS_URL.replace(/\/\/.*@/, "//***@"),
    });

    await prisma.$connect();
    logger.info("Database connected successfully");

    await redis.ping();
    logger.info("Redis connected successfully");

    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${config.NODE_ENV}`);
      logger.info(`API Docs: http://localhost:${PORT}/api/docs`);
    });

    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      server.close(async () => {
        logger.info("HTTP server closed");
        await prisma.$disconnect();
        await redis.quit();
        logger.info("Connections closed, exiting...");
        process.exit(0);
      });

      setTimeout(() => {
        logger.error("Could not close connections gracefully, forcing exit...");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();