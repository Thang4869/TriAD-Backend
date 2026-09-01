import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let capturedOptions: any;

vi.mock("@prisma/client", () => {
  const PrismaClient = vi.fn(function (this: any, options: any) {
    capturedOptions = options;
  });
  return { PrismaClient };
});

describe("Prisma client singleton", () => {
  const OLD_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    capturedOptions = undefined;
    (global as any).prisma = undefined;
  });

  afterEach(() => {
    process.env.NODE_ENV = OLD_ENV;
    (global as any).prisma = undefined;
  });

  it("uses verbose logging in development", async () => {
    process.env.NODE_ENV = "development";
    await import("@core/database/prisma");

    expect(capturedOptions.log).toEqual(["query", "info", "warn", "error"]);
  });

  it("uses error-only logging outside development", async () => {
    process.env.NODE_ENV = "test";
    await import("@core/database/prisma");

    expect(capturedOptions.log).toEqual(["error"]);
  });

  it("caches the client on globalThis when not in production", async () => {
    process.env.NODE_ENV = "development";
    const mod = await import("@core/database/prisma");

    expect((global as any).prisma).toBe(mod.default);
  });

  it("does not cache the client on globalThis in production", async () => {
    process.env.NODE_ENV = "production";
    await import("@core/database/prisma");

    expect((global as any).prisma).toBeUndefined();
  });

  it("reuses an existing global.prisma instance instead of creating a new one", async () => {
    const existingClient = { fake: "existing-client" };
    (global as any).prisma = existingClient;
    process.env.NODE_ENV = "development";

    const mod = await import("@core/database/prisma");

    expect(mod.default).toBe(existingClient);
    const { PrismaClient } = await import("@prisma/client");
    expect(PrismaClient).not.toHaveBeenCalled();
  });
});
