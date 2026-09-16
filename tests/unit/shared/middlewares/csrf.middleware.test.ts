import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  csrfProtection,
  generateCsrfToken,
  csrfCookieOptions,
  CSRF_COOKIE_NAME,
} from "@shared/middlewares/csrf.middleware";
import { ForbiddenError } from "@shared/utils/errors";

const configMock = { isProduction: false };

vi.mock("@config", () => ({
  default: configMock,
  get isProduction() {
    return configMock.isProduction;
  },
}));

function run(req: Partial<Request>): NextFunction {
  const next = vi.fn() as NextFunction;
  csrfProtection(
    { headers: {}, cookies: {}, ...req } as Request,
    {} as Response,
    next,
  );
  return next;
}

const VALID_TOKEN = "a".repeat(64);

describe("generateCsrfToken", () => {
  it("sinh chuỗi hex 64 ký tự (32 bytes ngẫu nhiên)", () => {
    const token = generateCsrfToken();

    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hai lần gọi cho ra hai token khác nhau", () => {
    expect(generateCsrfToken()).not.toBe(generateCsrfToken());
  });
});

describe("csrfCookieOptions", () => {
  beforeEach(() => {
    configMock.isProduction = false;
    delete process.env.COOKIE_DOMAIN;
  });

  it("httpOnly = false để frontend đọc được token và gửi lại qua header", () => {
    expect(csrfCookieOptions(1000).httpOnly).toBe(false);
  });

  it("môi trường dev: secure = false, sameSite = 'lax'", () => {
    const options = csrfCookieOptions(1000);

    expect(options.secure).toBe(false);
    expect(options.sameSite).toBe("lax");
    expect(options.maxAge).toBe(1000);
    expect(options.path).toBe("/");
  });

  it("môi trường production: secure = true, sameSite = 'none' cho cross-site", () => {
    configMock.isProduction = true;

    const options = csrfCookieOptions(1000);

    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe("none");
  });

  it("chỉ gắn domain khi COOKIE_DOMAIN được cấu hình", () => {
    expect("domain" in csrfCookieOptions(1000)).toBe(false);

    process.env.COOKIE_DOMAIN = ".example.com";
    expect(csrfCookieOptions(1000)).toMatchObject({ domain: ".example.com" });
  });
});

describe("csrfProtection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bỏ qua kiểm tra khi client dùng Bearer token (không dựa vào cookie)", () => {
    const next = run({
      headers: { authorization: "Bearer abc" },
      cookies: { refreshToken: "r" },
    });

    expect(next).toHaveBeenCalledWith();
  });

  it("bỏ qua kiểm tra khi request không có refreshToken cookie", () => {
    const next = run({ cookies: {} });

    expect(next).toHaveBeenCalledWith();
  });

  it("cho qua khi cookie token và header token trùng khớp", () => {
    const next = run({
      cookies: { refreshToken: "r", [CSRF_COOKIE_NAME]: VALID_TOKEN },
      headers: { "x-csrf-token": VALID_TOKEN },
    });

    expect(next).toHaveBeenCalledWith();
  });

  it("chặn khi thiếu header x-csrf-token", () => {
    const next = run({
      cookies: { refreshToken: "r", [CSRF_COOKIE_NAME]: VALID_TOKEN },
      headers: {},
    });

    const error = vi.mocked(next).mock.calls[0][0] as unknown as ForbiddenError;
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.message).toBe("Invalid or missing CSRF token");
  });

  it("chặn khi thiếu cookie csrfToken", () => {
    const next = run({
      cookies: { refreshToken: "r" },
      headers: { "x-csrf-token": VALID_TOKEN },
    });

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });

  it("chặn khi hai token khác nhau nhưng cùng độ dài", () => {
    const next = run({
      cookies: { refreshToken: "r", [CSRF_COOKIE_NAME]: VALID_TOKEN },
      headers: { "x-csrf-token": "b".repeat(64) },
    });

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });

  it("chặn khi hai token khác độ dài (không crash timingSafeEqual)", () => {
    const next = run({
      cookies: { refreshToken: "r", [CSRF_COOKIE_NAME]: VALID_TOKEN },
      headers: { "x-csrf-token": "short" },
    });

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });

  it("chặn khi header bị gửi nhiều lần (mảng thay vì string)", () => {
    const next = run({
      cookies: { refreshToken: "r", [CSRF_COOKIE_NAME]: VALID_TOKEN },
      headers: { "x-csrf-token": [VALID_TOKEN, VALID_TOKEN] },
    });

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });
});
