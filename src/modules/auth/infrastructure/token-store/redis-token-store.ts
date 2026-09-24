import redis from "@core/redis/client";
import { TokenStorePort } from "../../application/ports/token-store.port";

export class RedisTokenStore implements TokenStorePort {
  async get(key: string): Promise<string | null> {
    return redis.get(key);
  }

  async set(
    key: string,
    value: string,
    expiresInSeconds: number,
  ): Promise<void> {
    await redis.set(key, value, "EX", expiresInSeconds);
  }

  async delete(key: string): Promise<void> {
    await redis.del(key);
  }

  async getAndDelete(key: string): Promise<string | null> {
    const result = await redis.eval(
      "local value = redis.call('get', KEYS[1]); if value then redis.call('del', KEYS[1]); return value end; return false",
      1,
      key,
    );

    return typeof result === "string" ? result : null;
  }
}
