import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  csrfProtection,
  generateCsrfToken,
  csrfCookieOptions,
  CSRF_COOKIE_NAME,
} from "@shared/middlewares/csrf.middleware";
import { AuthorizationError } from "@shared/errors/application-error";
import { authSessionFixture } from "../../../helpers/auth-session";

// vi.mock() được Vitest hoist lên ĐẦU file, TRƯỚC khi `const configMock = ...` chạy.
// vi.hoisted() đảm bảo object này tồn tại sẵn ngay khi factory được gọi (fix TDZ).
const { configMock } = vi.hoisted(() => ({
  configMock: {
    isProduction: false,
    COOKIE_DOMAIN: undefined as string | undefined,
    JWT_REFRESH_SECRET: "disposable-csrf-middleware-secret",
  },
}));

vi.mock("@config", () => ({
  default: configMock,
  // Cung cấp luôn named export `config` cho mọi consumer dùng
  // `import { config } from "@config"` (ví dụ auth.routes.ts, app.ts).
  config: configMock,
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
  it("giữ hợp đồng CSRF gồm 64 ký tự hex", () => {
    const token = generateCsrfToken("session-1");

    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hai lần gọi cho ra hai token khác nhau", () => {
    expect(generateCsrfToken("session-1")).not.toBe(
      generateCsrfToken("session-1"),
    );
  });
});

describe("csrfCookieOptions", () => {
  beforeEach(() => {
    configMock.isProduction = false;
    configMock.COOKIE_DOMAIN = undefined;
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

    configMock.COOKIE_DOMAIN = ".example.com";

    expect(csrfCookieOptions(1000)).toMatchObject({
      domain: ".example.com",
    });
  });
});

describe("csrfProtection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a matching but unsigned injected cookie/header pair", () => {
    const next = run({
      method: "POST",
      cookies: { accessToken: "access", [CSRF_COOKIE_NAME]: VALID_TOKEN },
      headers: { "x-csrf-token": VALID_TOKEN },
    });
    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });

  it("does not let an empty Bearer header bypass cookie CSRF protection", () => {
    const next = run({
      method: "POST",
      cookies: { accessToken: "access" },
      headers: { authorization: "Bearer " },
    });
    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });

  it("rejects a public login submitted as an HTML form", () => {
    const next = run({
      method: "POST",
      path: "/api/auth/login",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });

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

  it("chặn POST dùng accessToken cookie khi thiếu CSRF token", () => {
    const next = run({
      method: "POST",
      cookies: { accessToken: "access" },
      headers: {},
    });

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });

  it("cho qua khi cookie token và header token trùng khớp", () => {
    const token = generateCsrfToken("session-1");
    const next = run({
      method: "POST",
      cookies: {
        ...authSessionFixture("session-1"),
        [CSRF_COOKIE_NAME]: token,
      },
      headers: { "x-csrf-token": token },
    });

    expect(next).toHaveBeenCalledWith();
  });

  it("rejects a genuine token copied from another login session", () => {
    const token = generateCsrfToken("other-session");
    const next = run({
      method: "POST",
      cookies: { ...authSessionFixture("session-1"), csrfToken: token },
      headers: { "x-csrf-token": token },
    });
    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });

  it("does not bind a protected write to an injected refresh identity", () => {
    const token = generateCsrfToken("other-session");
    const next = run({
      method: "POST",
      path: "/api/cart/items",
      cookies: {
        accessToken: authSessionFixture("session-1").accessToken,
        refreshToken: authSessionFixture("other-session").refreshToken,
        csrfToken: token,
      },
      headers: { "x-csrf-token": token },
    });
    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });

  it.each(["/api/auth/refresh", "/API/AUTH/REFRESH/"])(
    "validates refresh against its own session without an access cookie: %s",
    (path) => {
      const token = generateCsrfToken("session-1");
      const next = run({
        method: "POST",
        path,
        cookies: {
          refreshToken: authSessionFixture("session-1").refreshToken,
          csrfToken: token,
        },
        headers: { "x-csrf-token": token },
      });
      expect(next).toHaveBeenCalledWith();
    },
  );

  it("supports the route-mounted refresh middleware", () => {
    const token = generateCsrfToken("session-1");
    const next = run({
      method: "POST",
      baseUrl: "/api/auth",
      path: "/refresh",
      cookies: {
        refreshToken: authSessionFixture("session-1").refreshToken,
        csrfToken: token,
      },
      headers: { "x-csrf-token": token },
    });
    expect(next).toHaveBeenCalledWith();
  });

  it.each(["login", "register", "resend-verification", "verify-totp"])(
    "allows JSON public authentication without an old session's CSRF: %s",
    (route) => {
      const next = run({
        method: "POST",
        path: `/api/auth/${route}`,
        cookies: { accessToken: "old-session" },
        headers: { "content-type": "application/json; charset=utf-8" },
      });
      expect(next).toHaveBeenCalledWith();
    },
  );

  it("rejects cross-site public JSON authentication without an Origin in production", () => {
    configMock.isProduction = true;
    try {
      const next = run({
        method: "POST",
        path: "/api/auth/login",
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "cross-site",
        },
      });
      expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(
        AuthorizationError,
      );
    } finally {
      configMock.isProduction = false;
    }
  });

  it("chặn khi thiếu header x-csrf-token", () => {
    const next = run({
      cookies: { refreshToken: "r", [CSRF_COOKIE_NAME]: VALID_TOKEN },
      headers: {},
    });

    const error = vi.mocked(next).mock
      .calls[0][0] as unknown as AuthorizationError;
    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error.message).toBe("Invalid or missing CSRF token");
  });

  it("chặn khi thiếu cookie csrfToken", () => {
    const next = run({
      cookies: { refreshToken: "r" },
      headers: { "x-csrf-token": VALID_TOKEN },
    });

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });

  it("chặn khi hai token khác nhau nhưng cùng độ dài", () => {
    const next = run({
      cookies: { refreshToken: "r", [CSRF_COOKIE_NAME]: VALID_TOKEN },
      headers: { "x-csrf-token": "b".repeat(64) },
    });

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });

  it("chặn khi hai token khác độ dài (không crash timingSafeEqual)", () => {
    const next = run({
      cookies: { refreshToken: "r", [CSRF_COOKIE_NAME]: VALID_TOKEN },
      headers: { "x-csrf-token": "short" },
    });

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });

  it("chặn khi header bị gửi nhiều lần (mảng thay vì string)", () => {
    const next = run({
      cookies: { refreshToken: "r", [CSRF_COOKIE_NAME]: VALID_TOKEN },
      headers: { "x-csrf-token": [VALID_TOKEN, VALID_TOKEN] },
    });

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });
  it("rejects structured csrf cookies without throwing", () => {
    const next = run({
      method: "POST",
      cookies: {
        refreshToken: "r",
        [CSRF_COOKIE_NAME]: { value: VALID_TOKEN },
      },
      headers: { "x-csrf-token": VALID_TOKEN },
    });
    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });
});
