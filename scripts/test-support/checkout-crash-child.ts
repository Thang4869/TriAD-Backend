// Disposable integration harness: real HTTP/middleware/service/DB, synthetic auth.
import express from "express";
import { randomUUID } from "node:crypto";
import prisma from "@core/database/prisma";
import redis from "@core/redis/client";
import { CheckoutService } from "@modules/checkout/checkout.service";
import { PrismaCheckoutRepository } from "@modules/checkout/infrastructure/repositories/prisma-checkout.repository";
import { PrismaCheckoutUnitOfWork } from "@modules/checkout/infrastructure/prisma-checkout-unit-of-work";
import { PricingService } from "@modules/checkout/services/pricing.service";
import { StockReservationService } from "@modules/checkout/services/stock-reservation.service";
import { idempotencyMiddleware } from "@shared/middlewares/idempotency.middleware";
import { createErrorHandler } from "@shared/middlewares/error-handler.middleware";
import { noopMetrics, noopTracer } from "../../tests/helpers/observability";

const [userId, mode] = process.argv.slice(2);
if (
  process.env.NODE_ENV !== "test" ||
  !userId ||
  !["before-commit", "after-commit", "normal"].includes(mode)
) {
  throw new Error("Disposable checkout test configuration required");
}
const hold = async () => {
  process.send?.({ event: mode });
  await new Promise<void>(() => {});
};
const realUow = new PrismaCheckoutUnitOfWork();
const service = new CheckoutService(
  new PrismaCheckoutRepository(),
  mode === "before-commit"
    ? {
        run: (work) =>
          realUow.run(async (tx) => {
            const value = await work(tx);
            await hold();
            return value;
          }),
      }
    : realUow,
  new PricingService({ isEnabled: () => true }),
  new StockReservationService(noopTracer, noopMetrics),
  { generate: () => "CRASH-" + randomUUID() },
  noopTracer,
  noopMetrics,
);

async function start() {
  process.send?.({ event: "stage", stage: "database-connect" });
  await prisma.$connect();
  process.send?.({ event: "stage", stage: "redis-connect" });
  await redis.ping();
  process.send?.({ event: "stage", stage: "http-listen" });
  const app = express();
  app.use(express.json());
  const router = express.Router();
  router.use((req, _res, next) => {
    req.user = { id: userId, email: "synthetic@example.invalid", role: "USER" };
    next();
  });
  router.post("/", idempotencyMiddleware(), (req, res, next) => {
    void (async () => {
      const result = await service.checkout(userId, req.body);
      if (mode === "after-commit") await hold();
      res.status(201).json(result);
    })().catch((error: unknown) => {
      process.send?.({
        event: "fixture-error",
        error:
          error instanceof Error
            ? error.message.replace(
                /(?:postgresql|rediss?):\/\/\S+/g,
                "<redacted>",
              )
            : "Unknown checkout error",
      });
      next(error);
    });
  });
  app.use("/api/checkout", router);
  app.use(createErrorHandler({ classify: () => null }));
  const server = app.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (address && typeof address !== "string")
      process.send?.({ event: "ready", port: address.port });
  });
}
void start().catch((error: unknown) => {
  process.send?.({
    event: "fixture-error",
    error:
      error instanceof Error
        ? error.message.replace(/(?:postgresql|rediss?):\/\/\S+/g, "<redacted>")
        : "Unknown startup error",
  });
  process.exitCode = 1;
  process.disconnect?.();
});
