import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { AuthController } from "@modules/auth/auth.controller";
import type { AuthService } from "@modules/auth/auth.service";
import config from "@config";
import { readCsrfSessionId } from "@shared/utils/csrf-token";

vi.mock("@shared/utils/csrf-token", () => ({
  readCsrfSessionId: vi.fn(() => "session-1"),
  generateCsrfToken: vi.fn(() => "csrf-token"),
}));

function response() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  res.set = vi.fn().mockReturnValue(res);
  res.redirect = vi.fn().mockReturnValue(res);
  return res;
}
function request(overrides: Record<string, unknown> = {}) {
  return {
    body: {},
    query: {},
    params: {},
    cookies: {},
    headers: {},
    user: { id: "user-1" },
    ...overrides,
  } as unknown as Request;
}
describe("AuthController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("register returns created user and message", async () => {
    const service = {
      register: vi
        .fn()
        .mockResolvedValue({ user: { id: "u1" }, message: "Registered" }),
    } as unknown as AuthService;
    const res = response();
    await new AuthController(service).register(
      request({ body: { email: "a@b.com" } }),
      res,
      vi.fn(),
    );
    expect(service.register).toHaveBeenCalledWith({ email: "a@b.com" });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { user: { id: "u1" } },
      message: "Registered",
    });
  });

  it("login returns pre-auth challenge without issuing auth cookies", async () => {
    const service = {
      login: vi.fn().mockResolvedValue({
        requires2FA: true,
        preAuthToken: "pre",
        message: "Verify",
      }),
    } as unknown as AuthService;
    const res = response();
    await new AuthController(service).login(
      request({ body: { email: "a@b.com", password: "pw" } }),
      res,
      vi.fn(),
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { requires2FA: true, preAuthToken: "pre", message: "Verify" },
    });
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("rejects an unexpected login service result", async () => {
    const service = {
      login: vi.fn().mockResolvedValue({ unexpected: true }),
    } as unknown as AuthService;
    const next = vi.fn();
    new AuthController(service).login(request(), response(), next);
    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Unexpected result from login" }),
      );
    });
  });

  it("requires refresh token before calling service", async () => {
    const service = { refreshToken: vi.fn() } as unknown as AuthService;
    const next = vi.fn();
    await new AuthController(service).refresh(request(), response(), next);
    expect(service.refreshToken).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Refresh token required" }),
    );
  });

  it("requires a token when verifying 2FA", async () => {
    const service = { verify2FA: vi.fn() } as unknown as AuthService;
    const next = vi.fn();
    await new AuthController(service).verify2FA(
      request({ body: {} }),
      response(),
      next,
    );
    expect(service.verify2FA).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Token is required" }),
    );
  });

  it("requires both pre-auth token and TOTP token", async () => {
    const service = { verifyTOTP: vi.fn() } as unknown as AuthService;
    const next = vi.fn();
    await new AuthController(service).verifyTOTP(
      request({ body: { token: "123456" } }),
      response(),
      next,
    );
    expect(service.verifyTOTP).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "preAuthToken and token are required",
      }),
    );
  });

  it("redirects OAuth callback failures to the frontend error URL", async () => {
    const service = {} as AuthService;
    const res = response();
    await new AuthController(service).googleCallback(
      request({ user: null }),
      res,
    );
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringMatching(/\?error=auth_failed$/),
    );
  });

  it("verifies an email and issues authentication cookies", async () => {
    const service = {
      verifyEmail: vi.fn().mockResolvedValue({
        accessToken: "access",
        refreshToken: "refresh",
        user: { id: "u1" },
      }),
    } as unknown as AuthService;
    const res = response();

    await new AuthController(service).verifyEmail(
      request({ query: { token: "verification-token" } }),
      res,
      vi.fn(),
    );

    expect(service.verifyEmail).toHaveBeenCalledWith("verification-token");
    expect(res.cookie).toHaveBeenCalledTimes(3);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { user: { id: "u1" }, csrfToken: "csrf-token" },
      }),
    );
  });

  it("rejects email verification without a token", async () => {
    const service = { verifyEmail: vi.fn() } as unknown as AuthService;
    const next = vi.fn();

    await new AuthController(service).verifyEmail(request(), response(), next);

    expect(service.verifyEmail).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Verification token is required" }),
    );
  });

  it("resends email verification", async () => {
    const service = {
      resendVerificationEmail: vi.fn().mockResolvedValue({ message: "Sent" }),
    } as unknown as AuthService;
    const res = response();

    await new AuthController(service).resendVerification(
      request({ body: { email: "user@example.com" } }),
      res,
      vi.fn(),
    );

    expect(service.resendVerificationEmail).toHaveBeenCalledWith(
      "user@example.com",
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Sent",
    });
  });

  it("login issues cookies when credentials produce auth tokens", async () => {
    const service = {
      login: vi.fn().mockResolvedValue({
        accessToken: "access",
        refreshToken: "refresh",
        user: { id: "u1" },
      }),
    } as unknown as AuthService;
    const res = response();

    await new AuthController(service).login(
      request({ body: { email: "user@example.com", password: "pw" } }),
      res,
      vi.fn(),
    );

    expect(res.cookie).toHaveBeenCalledTimes(3);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { user: { id: "u1" }, csrfToken: "csrf-token" },
      }),
    );
  });

  it("rejects auth cookie issuance when the access token has no CSRF session", async () => {
    vi.mocked(readCsrfSessionId).mockReturnValueOnce(null);
    const service = {
      login: vi.fn().mockResolvedValue({
        accessToken: "access",
        refreshToken: "refresh",
        user: { id: "u1" },
      }),
    } as unknown as AuthService;
    const next = vi.fn();

    await new AuthController(service).login(
      request({ body: { email: "user@example.com", password: "pw" } }),
      response(),
      next,
    );

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Sign in again to renew the session",
        }),
      );
    });
  });

  it("applies production cookie security and configured cookie domain", async () => {
    const productionDescriptor = Object.getOwnPropertyDescriptor(
      config,
      "isProduction",
    );
    const domainDescriptor = Object.getOwnPropertyDescriptor(
      config,
      "COOKIE_DOMAIN",
    );
    Object.defineProperty(config, "isProduction", {
      value: true,
      configurable: true,
    });
    Object.defineProperty(config, "COOKIE_DOMAIN", {
      value: ".example.com",
      configurable: true,
    });
    const service = {
      login: vi.fn().mockResolvedValue({
        accessToken: "access",
        refreshToken: "refresh",
        user: { id: "u1" },
      }),
    } as unknown as AuthService;
    const res = response();

    try {
      await new AuthController(service).login(
        request({ body: { email: "user@example.com", password: "pw" } }),
        res,
        vi.fn(),
      );

      expect(res.cookie).toHaveBeenCalledWith(
        "accessToken",
        "access",
        expect.objectContaining({
          secure: true,
          sameSite: "none",
          domain: ".example.com",
        }),
      );
    } finally {
      if (productionDescriptor)
        Object.defineProperty(config, "isProduction", productionDescriptor);
      if (domainDescriptor)
        Object.defineProperty(config, "COOKIE_DOMAIN", domainDescriptor);
    }
  });

  it("refreshes using the refresh cookie before the body token", async () => {
    const service = {
      refreshToken: vi.fn().mockResolvedValue({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        user: { id: "u1" },
      }),
    } as unknown as AuthService;
    const res = response();

    await new AuthController(service).refresh(
      request({
        cookies: { refreshToken: "cookie-token" },
        body: { refreshToken: "body-token" },
      }),
      res,
      vi.fn(),
    );

    expect(service.refreshToken).toHaveBeenCalledWith("cookie-token");
    expect(res.cookie).toHaveBeenCalledTimes(3);
  });

  it("refreshes using the body token when no refresh cookie exists", async () => {
    const service = {
      refreshToken: vi.fn().mockResolvedValue({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        user: { id: "u1" },
      }),
    } as unknown as AuthService;

    await new AuthController(service).refresh(
      request({ body: { refreshToken: "body-token" } }),
      response(),
      vi.fn(),
    );

    expect(service.refreshToken).toHaveBeenCalledWith("body-token");
  });

  it("logs out and clears all authentication cookies", async () => {
    const service = {
      logout: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const res = response();

    await new AuthController(service).logout(
      request({
        headers: { authorization: "Bearer access-token" },
        cookies: { refreshToken: "refresh-token" },
      }),
      res,
      vi.fn(),
    );

    expect(service.logout).toHaveBeenCalledWith(
      "user-1",
      "access-token",
      "refresh-token",
    );
    expect(res.clearCookie).toHaveBeenCalledTimes(3);
    expect(res.json).toHaveBeenCalled();
  });

  it("clears authentication cookies even when logout fails", async () => {
    const service = {
      logout: vi.fn().mockRejectedValue(new Error("logout failed")),
    } as unknown as AuthService;
    const res = response();
    const next = vi.fn();

    await new AuthController(service).logout(request(), res, next);

    expect(res.clearCookie).toHaveBeenCalledTimes(3);
    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  it("renews the CSRF cookie for a valid access session", async () => {
    const res = response();

    await new AuthController({} as AuthService).csrf(
      request({ cookies: { accessToken: "access-token" } }),
      res,
      vi.fn(),
    );

    expect(readCsrfSessionId).toHaveBeenCalledWith("access-token", "access");
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(res.cookie).toHaveBeenCalledOnce();
  });

  it("uses the bearer access token when renewing CSRF", async () => {
    const res = response();

    await new AuthController({} as AuthService).csrf(
      request({ headers: { authorization: "Bearer bearer-token" } }),
      res,
      vi.fn(),
    );

    expect(readCsrfSessionId).toHaveBeenCalledWith("bearer-token", "access");
  });

  it("falls back to the access cookie when the bearer value is empty", async () => {
    const res = response();

    await new AuthController({} as AuthService).csrf(
      request({
        headers: { authorization: "Bearer " },
        cookies: { accessToken: "cookie-token" },
      }),
      res,
      vi.fn(),
    );

    expect(readCsrfSessionId).toHaveBeenCalledWith("cookie-token", "access");
  });

  it("rejects CSRF renewal when the access token has no session", async () => {
    vi.mocked(readCsrfSessionId).mockReturnValueOnce(null);
    const next = vi.fn();

    await new AuthController({} as AuthService).csrf(
      request(),
      response(),
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Sign in again to renew the session",
      }),
    );
  });

  it("enables two-factor authentication", async () => {
    const result = { secret: "secret", qrCode: "qr" };
    const service = {
      enable2FA: vi.fn().mockResolvedValue(result),
    } as unknown as AuthService;
    const res = response();

    await new AuthController(service).enable2FA(request(), res, vi.fn());

    expect(service.enable2FA).toHaveBeenCalledWith("user-1");
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  it("verifies a two-factor token", async () => {
    const result = { enabled: true };
    const service = {
      verify2FA: vi.fn().mockResolvedValue(result),
    } as unknown as AuthService;
    const res = response();

    await new AuthController(service).verify2FA(
      request({ body: { token: "123456" } }),
      res,
      vi.fn(),
    );

    expect(service.verify2FA).toHaveBeenCalledWith("user-1", "123456");
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  it("rejects an unexpected TOTP verification result", async () => {
    const service = {
      verifyTOTP: vi.fn().mockResolvedValue({ unexpected: true }),
    } as unknown as AuthService;
    const next = vi.fn();

    await new AuthController(service).verifyTOTP(
      request({ body: { preAuthToken: "pre", token: "123456" } }),
      response(),
      next,
    );

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Unexpected result from TOTP verification",
        }),
      );
    });
  });

  it("verifies TOTP and issues authentication cookies", async () => {
    const service = {
      verifyTOTP: vi.fn().mockResolvedValue({
        accessToken: "access",
        refreshToken: "refresh",
        user: { id: "u1" },
      }),
    } as unknown as AuthService;
    const res = response();

    await new AuthController(service).verifyTOTP(
      request({ body: { preAuthToken: "pre", token: "123456" } }),
      res,
      vi.fn(),
    );

    expect(service.verifyTOTP).toHaveBeenCalledWith("pre", "123456");
    expect(res.cookie).toHaveBeenCalledTimes(3);
  });

  it("redirects successful Google and Facebook OAuth callbacks", async () => {
    const service = {} as AuthService;
    const user = {
      tokens: { accessToken: "access", refreshToken: "refresh" },
    };
    const googleResponse = response();
    const facebookResponse = response();
    const controller = new AuthController(service);

    await controller.googleCallback(request({ user }), googleResponse);
    await controller.facebookCallback(request({ user }), facebookResponse);

    expect(googleResponse.redirect).toHaveBeenCalledWith(config.FRONTEND_URL);
    expect(facebookResponse.redirect).toHaveBeenCalledWith(config.FRONTEND_URL);
    expect(googleResponse.cookie).toHaveBeenCalledTimes(3);
    expect(facebookResponse.cookie).toHaveBeenCalledTimes(3);
  });

  it("redirects Facebook OAuth callback failures to the frontend error URL", async () => {
    const res = response();

    await new AuthController({} as AuthService).facebookCallback(
      request({ user: null }),
      res,
    );

    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringMatching(/\?error=auth_failed$/),
    );
  });
});
