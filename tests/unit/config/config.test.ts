import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Config validation", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("throws when missing DATABASE_URL in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);
    await expect(async () => {
      await import("@config");
    }).rejects.toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("logs error and exits when validation fails (non-test env)", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);
    process.env.NODE_ENV = "development";
    process.env.JWT_ACCESS_SECRET = "short";
    await expect(async () => {
      await import("@config");
    }).rejects.toThrow("process.exit called");
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
