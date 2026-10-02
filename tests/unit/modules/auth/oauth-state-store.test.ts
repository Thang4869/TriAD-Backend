import { describe, expect, it, vi } from "vitest";
import { RedisOAuthStateStore } from "@modules/auth/infrastructure/token-store/redis-oauth-state-store";
import type { TokenStorePort } from "@modules/auth/application/ports/token-store.port";

function store(): TokenStorePort {
  const values = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      values.delete(key);
    }),
    getAndDelete: vi.fn(async (key: string) => {
      const value = values.get(key) ?? null;
      values.delete(key);
      return value;
    }),
    setIfAbsent: vi.fn(),
  };
}

describe("RedisOAuthStateStore", () => {
  it("issues high-entropy provider-bound state and consumes it once", async () => {
    const tokenStore = store();
    const stateStore = new RedisOAuthStateStore(tokenStore);
    const state = await stateStore.issue("GOOGLE");

    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await stateStore.consume("GOOGLE", state)).toBe(true);
    expect(await stateStore.consume("GOOGLE", state)).toBe(false);
    expect(tokenStore.getAndDelete).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown, expired, malformed, and wrong-provider state", async () => {
    const tokenStore = store();
    const stateStore = new RedisOAuthStateStore(tokenStore);

    expect(await stateStore.consume("GOOGLE", "unknown-state")).toBe(false);
    const state = await stateStore.issue("GOOGLE");
    expect(await stateStore.consume("FACEBOOK", state)).toBe(false);
    expect(await stateStore.consume("GOOGLE", state)).toBe(false);
  });
});
