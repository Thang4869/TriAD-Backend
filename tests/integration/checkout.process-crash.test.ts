import { fork, ChildProcess } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const disposeClients: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  await Promise.all(disposeClients.splice(0).map((dispose) => dispose()));
});

function message(
  child: ChildProcess,
  event: string,
): Promise<{ port: number }> {
  return new Promise((accept, reject) => {
    let stage = "spawn";
    const cleanup = () => {
      clearTimeout(timer);
      child.off("message", receive);
      child.off("exit", exited);
      child.off("error", failed);
    };
    const receive = (value: unknown) => {
      const result = value as {
        event?: string;
        port: number;
        stage?: string;
        error?: string;
      };
      if (result.event === "stage") stage = result.stage ?? stage;
      if (result.event === "fixture-error") {
        cleanup();
        reject(
          new Error(
            "Checkout fixture failed while waiting for " +
              event +
              ": " +
              result.error,
          ),
        );
      }
      if (result.event === event) {
        cleanup();
        accept(result);
      }
    };
    const exited = () => {
      cleanup();
      reject(new Error("Checkout fixture child exited before marker"));
    };
    const failed = () => {
      cleanup();
      reject(new Error("Checkout fixture child could not start"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Checkout fixture marker timed out: " +
            event +
            " (stage " +
            stage +
            ")",
        ),
      );
    }, 20_000);
    child.on("message", receive);
    child.once("exit", exited);
    child.once("error", failed);
  });
}

async function kill(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  const [, signal] = await exited;
  expect(signal).toBe("SIGKILL");
}

describe("checkout HTTP recovery after real process termination", () => {
  it.each(["before-commit", "after-commit"])(
    "recovers after SIGKILL %s without duplicate stock/order/outbox effects",
    async (mode) => {
      // setupFiles sets worker-scoped URLs in beforeAll. Construct these clients
      // afterwards: a top-level singleton may have captured a different URL.
      const prisma = new PrismaClient({
        datasources: { db: { url: process.env.DATABASE_URL } },
      });
      const redis = new Redis(process.env.REDIS_URL!);
      disposeClients.push(
        () => prisma.$disconnect(),
        () => redis.quit(),
      );
      const user = await prisma.user.create({
        data: {
          email: randomUUID() + "@example.invalid",
          password: "unused",
          firstName: "Synthetic",
          lastName: "Crash",
          isVerified: true,
        },
      });
      const product = await prisma.product.create({
        data: {
          name: "Crash fixture",
          slug: randomUUID(),
          description: "Disposable",
          category: "test",
          price: 1000,
          stock: 5,
          images: [],
        },
      });
      const cart = await prisma.cart.create({ data: { userId: user.id } });
      await prisma.cartItem.create({
        data: { cartId: cart.id, productId: product.id, quantity: 1 },
      });
      const schemas = await prisma.$queryRaw<
        Array<{ schema: string }>
      >`SELECT current_schema() AS schema`;
      const dbUrl = new URL(process.env.DATABASE_URL!);
      dbUrl.searchParams.set("schema", schemas[0].schema);
      const key = "crash-" + randomUUID();
      const cacheKey = `idempotency:${user.id}:/api/checkout:${key}`;
      const children: ChildProcess[] = [];
      const start = async (childMode: string) => {
        const child = fork(
          resolve("scripts/test-support/checkout-crash-child.ts"),
          [user.id, childMode],
          {
            execArgv: [
              "-r",
              "ts-node/register/transpile-only",
              "-r",
              "tsconfig-paths/register",
            ],
            env: {
              ...process.env,
              DATABASE_URL: dbUrl.toString(),
              IDEMPOTENCY_TTL: "2",
              TS_NODE_BASEURL: "./",
              LOG_LEVEL: "error",
            },
            stdio: ["ignore", "ignore", "ignore", "ipc"],
          },
        );
        children.push(child);
        const ready = await message(child, "ready");
        return { child, url: `http://127.0.0.1:${ready.port}/api/checkout` };
      };
      const post = (url: string) =>
        fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": key,
          },
          body: JSON.stringify({
            paymentMethod: "COD",
            address: "Synthetic test address",
            phone: "0123456789",
          }),
          signal: AbortSignal.timeout(15_000),
        });
      try {
        const first = await start(mode);
        const held = message(first.child, mode);
        // No response is delivered: attach rejection handling before killing the socket.
        const lostResponse = post(first.url).then(
          () => "unexpected-response",
          () => "lost-response",
        );
        await held;
        expect(await prisma.order.count({ where: { userId: user.id } })).toBe(
          mode === "after-commit" ? 1 : 0,
        );
        const claim = await redis.get(cacheKey);
        expect(claim && JSON.parse(claim).state).toBe("IN_PROGRESS");
        await kill(first.child);
        expect(await lostResponse).toBe("lost-response");
        // Let the real shortened fixture lease expire; do not delete/replace it.
        const deadline = Date.now() + 6000;
        while (await redis.exists(cacheKey)) {
          if (Date.now() > deadline)
            throw new Error("Killed request lease did not expire");
          await new Promise((done) => setTimeout(done, 100));
        }
        const replacement = await start("normal");
        const recovered = await post(replacement.url);
        expect(recovered.status).toBe(201);
        const result = (await recovered.json()) as {
          order: { id: string };
          idempotent: boolean;
        };
        expect(result.idempotent).toBe(mode === "after-commit");
        await vi.waitFor(
          async () => {
            const cached = await redis.get(cacheKey);
            expect(cached && JSON.parse(cached).state).toBe("COMPLETED");
          },
          { timeout: 1500, interval: 20 },
        );
        const repeated = await post(replacement.url);
        expect(repeated.status).toBe(201);
        expect(
          ((await repeated.json()) as { order: { id: string } }).order.id,
        ).toBe(result.order.id);
        expect(await prisma.order.count({ where: { userId: user.id } })).toBe(
          1,
        );
        expect(
          await prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
        ).toMatchObject({ stock: 4, version: 1 });
        expect(
          await prisma.cartItem.count({ where: { cartId: cart.id } }),
        ).toBe(0);
        expect(
          await prisma.outboxEvent.count({
            where: { aggregateId: result.order.id, eventName: "OrderPlaced" },
          }),
        ).toBe(1);
      } finally {
        for (const child of children) await kill(child);
        await redis.del(cacheKey);
      }
    },
    60_000,
  );
});
