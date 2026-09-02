import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("dotenv", () => ({
  default: {
    config: vi.fn(),
  },
}));

describe("Config validation", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV };
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
    process.env.REDIS_URL = "redis://localhost";
    process.env.JWT_ACCESS_SECRET = "test-access-secret-32charslongenough";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret-32charslongenough";
    process.env.SMTP_HOST = "smtp.test.com";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    process.env.SMTP_FROM = "noreply@test.com";
  });

  afterEach(() => {
    process.env = OLD_ENV;
    vi.restoreAllMocks();
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

  it("throws (instead of exiting) when validation fails while NODE_ENV=test", async () => {
    process.env.JWT_ACCESS_SECRET = "short";
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit should not be called in test env");
    });

    await expect(async () => {
      await import("@config");
    }).rejects.toThrow(
      "Invalid configuration in test environment. Please check .env.test or fallback logic.",
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("adds a DATABASE_URL issue in production when DATABASE_URL is an empty string", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "";
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);

    await expect(async () => {
      await import("@config");
    }).rejects.toThrow("process.exit called");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("DATABASE_URL"),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("adds a REDIS_URL issue in production when REDIS_URL is an empty string", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.REDIS_URL = "";
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);

    await expect(async () => {
      await import("@config");
    }).rejects.toThrow("process.exit called");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("REDIS_URL"),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("không thêm lỗi nào khi ở production và đã có đủ DATABASE_URL, REDIS_URL, SMTP_*", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
    process.env.CLOUDINARY_API_KEY = "test-key";
    process.env.CLOUDINARY_API_SECRET = "test-secret";

    const { config } = await import("@config");

    expect(config.isProduction).toBe(true);
    expect(config.DATABASE_URL).toBe(
      "postgresql://user:pass@localhost:5432/db",
    );
  });

  it("thêm lỗi cho từng biến SMTP còn thiếu khi ở production", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.REDIS_URL = "redis://localhost:6379";
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);

    await expect(async () => {
      await import("@config");
    }).rejects.toThrow("process.exit called");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("SMTP_HOST"),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("áp dụng giá trị fallback cho JWT_ACCESS_SECRET/JWT_REFRESH_SECRET/DATABASE_URL khi NODE_ENV=test và chưa được set", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.DATABASE_URL;

    const { config } = await import("@config");

    expect(config.JWT_ACCESS_SECRET).toBe(
      "test-access-secret-32charslongenough",
    );
    expect(config.JWT_REFRESH_SECRET).toBe(
      "test-refresh-secret-32charslongenough",
    );
    expect(config.DATABASE_URL).toBe(
      "postgresql://postgres:postgres@localhost:5432/triad_test?schema=public",
    );
  });

  it("tách CORS_ORIGIN thành mảng khi biến môi trường được cung cấp", async () => {
    process.env.CORS_ORIGIN = "http://localhost:3000,http://localhost:4000";

    const { config } = await import("@config");

    expect(config.CORS_ORIGIN).toEqual([
      "http://localhost:3000",
      "http://localhost:4000",
    ]);
  });

  it("returns empty array for CORS_ORIGIN when env var is not set", async () => {
    delete process.env.CORS_ORIGIN;
    const { config } = await import("@config");
    expect(config.CORS_ORIGIN).toEqual([]);
  });
});
