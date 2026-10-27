import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

import redis from "@core/redis/client";
import { idempotencyMiddleware } from "@shared/middlewares/idempotency.middleware";
import { UnprocessableError } from "@shared/errors/application-error";

const createdKeys = new Set<string>();

afterEach(async () => {
  if (createdKeys.size > 0) {
    await redis.del(...createdKeys);
    createdKeys.clear();
  }
});

describe("idempotencyMiddleware with real Redis", () => {
  it("claims, completes, and replays the same request from Redis", async () => {
    const idempotencyKey = `redis-idem-${Date.now()}`;
    const userId = "redis-idempotency-user";
    const route = "/api/checkout";
    const cacheKey = `idempotency:${userId}:${route}:${idempotencyKey}`;

    createdKeys.add(cacheKey);

    const firstReq = createRequest(
      idempotencyKey,
      { amount: 100 },
      userId,
      route,
    );
    const firstRes = createResponse(201);
    const firstNext = vi.fn();

    await idempotencyMiddleware()(
      firstReq as Request,
      firstRes.response,
      firstNext,
    );

    expect(firstNext).toHaveBeenCalledWith();

    const inProgress = JSON.parse((await redis.get(cacheKey))!);

    expect(inProgress).toMatchObject({
      state: "IN_PROGRESS",
    });

    const inProgressTtl = await redis.ttl(cacheKey);

    expect(inProgressTtl).toBeGreaterThan(0);
    expect(inProgressTtl).toBeLessThanOrEqual(60);

    firstRes.response.json({
      orderId: "order-redis-1",
    });

    await vi.waitFor(async () => {
      const value = await redis.get(cacheKey);

      expect(value).not.toBeNull();
      expect(JSON.parse(value!)).toMatchObject({
        state: "COMPLETED",
        status: 201,
        data: {
          orderId: "order-redis-1",
        },
      });
    });

    const completedTtl = await redis.ttl(cacheKey);

    expect(completedTtl).toBeGreaterThan(60);

    const replayReq = createRequest(
      idempotencyKey,
      { amount: 100 },
      userId,
      route,
    );
    const replayRes = createResponse();
    const replayNext = vi.fn();

    await idempotencyMiddleware()(
      replayReq as Request,
      replayRes.response,
      replayNext,
    );

    expect(replayNext).not.toHaveBeenCalled();
    expect(replayRes.status).toHaveBeenCalledWith(201);
    expect(replayRes.json).toHaveBeenCalledWith({
      orderId: "order-redis-1",
    });
  });

  it("rejects reuse of the same Redis key with a different request body", async () => {
    const idempotencyKey = `redis-idem-different-${Date.now()}`;
    const userId = "redis-idempotency-user";
    const route = "/api/checkout";
    const cacheKey = `idempotency:${userId}:${route}:${idempotencyKey}`;

    createdKeys.add(cacheKey);

    const firstReq = createRequest(
      idempotencyKey,
      { amount: 100 },
      userId,
      route,
    );
    const firstRes = createResponse(201);

    await idempotencyMiddleware()(
      firstReq as Request,
      firstRes.response,
      vi.fn(),
    );

    firstRes.response.json({ orderId: "order-redis-2" });

    await vi.waitFor(async () => {
      const value = await redis.get(cacheKey);
      expect(value && JSON.parse(value).state).toBe("COMPLETED");
    });

    const secondReq = createRequest(
      idempotencyKey,
      { amount: 200 },
      userId,
      route,
    );
    const secondRes = createResponse();
    const secondNext = vi.fn();

    await idempotencyMiddleware()(
      secondReq as Request,
      secondRes.response,
      secondNext,
    );

    expect(secondNext).toHaveBeenCalledWith(expect.any(UnprocessableError));
    expect(secondRes.json).not.toHaveBeenCalled();
  });
  it("does not overwrite or delete a replacement claim from a stale response", async () => {
    const idempotencyKey = `redis-idem-fence-${Date.now()}`;
    const userId = "redis-idempotency-user";
    const route = "/api/checkout";
    const cacheKey = `idempotency:${userId}:${route}:${idempotencyKey}`;
    createdKeys.add(cacheKey);

    const req = createRequest(idempotencyKey, { amount: 100 }, userId, route);
    const successful = createResponse(201);
    await idempotencyMiddleware()(req as Request, successful.response, vi.fn());

    const oldValue = await redis.get(cacheKey);
    expect(oldValue).not.toBeNull();

    // Simulate lease expiry followed by a new owner's successful NX claim.
    const replacement = JSON.stringify({
      state: "IN_PROGRESS",
      requestHash: JSON.parse(oldValue!).requestHash,
      ownerId: "replacement-owner",
    });
    await redis.set(cacheKey, replacement, "EX", 60);

    successful.response.json({ orderId: "stale-order" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await redis.get(cacheKey)).toBe(replacement);

    const failed = createResponse(500);
    await idempotencyMiddleware()(
      createRequest(
        `${idempotencyKey}-failure`,
        { amount: 100 },
        userId,
        route,
      ) as Request,
      failed.response,
      vi.fn(),
    );
    const failedKey = `idempotency:${userId}:${route}:${idempotencyKey}-failure`;
    createdKeys.add(failedKey);
    const failedClaim = await redis.get(failedKey);
    expect(failedClaim).not.toBeNull();
    await redis.set(failedKey, replacement, "EX", 60);
    failed.response.json({ error: "late failure" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await redis.get(failedKey)).toBe(replacement);
  });
});

function createRequest(
  idempotencyKey: string,
  body: Record<string, unknown>,
  userId: string,
  route: string,
): Partial<Request> {
  return {
    method: "POST",
    headers: {
      "idempotency-key": idempotencyKey,
    },
    body: { ...body },
    user: {
      id: userId,
      email: "redis-idempotency@test.local",
      role: "USER",
    },
    baseUrl: route,
  };
}

function createResponse(initialStatusCode = 200) {
  const response = {
    statusCode: initialStatusCode,
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;

  const status = vi.mocked(response.status);
  const json = vi.mocked(response.json);

  status.mockImplementation((code: number) => {
    response.statusCode = code;
    return response;
  });

  json.mockImplementation(() => response);

  return {
    response,
    status,
    json,
  };
}
