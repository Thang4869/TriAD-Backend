import redis from "@core/redis/client";

const IDEMPOTENCY_PREFIX = "idempotent:";
const DEFAULT_TTL = parseInt(process.env.IDEMPOTENCY_TTL || "86400", 10);

export const cacheIdempotentResponse = async (
  key: string,
  response: any,
  ttl: number = DEFAULT_TTL,
): Promise<void> => {
  await redis.setex(
    `${IDEMPOTENCY_PREFIX}${key}`,
    ttl,
    JSON.stringify(response),
  );
};

export const getCachedIdempotentResponse = async (
  key: string,
): Promise<any | null> => {
  const data = await redis.get(`${IDEMPOTENCY_PREFIX}${key}`);
  return data ? JSON.parse(data) : null;
};
