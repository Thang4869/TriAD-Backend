import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { AuthController } from "@modules/auth/auth.controller";
import type { AuthService } from "@modules/auth/auth.service";

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
  return { body: {}, query: {}, params: {}, cookies: {}, headers: {}, user: { id: "user-1" }, ...overrides } as unknown as Request;
}
describe("AuthController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("register returns created user and message", async () => {
    const service = { register: vi.fn().mockResolvedValue({ user: { id: "u1" }, message: "Registered" }) } as unknown as AuthService;
    const res = response();
    await new AuthController(service).register(request({ body: { email: "a@b.com" } }), res, vi.fn());
    expect(service.register).toHaveBeenCalledWith({ email: "a@b.com" });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { user: { id: "u1" } }, message: "Registered" });
  });

  it("login returns pre-auth challenge without issuing auth cookies", async () => {
    const service = { login: vi.fn().mockResolvedValue({ requires2FA: true, preAuthToken: "pre", message: "Verify" }) } as unknown as AuthService;
    const res = response();
    await new AuthController(service).login(request({ body: { email: "a@b.com", password: "pw" } }), res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { requires2FA: true, preAuthToken: "pre", message: "Verify" } });
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("rejects an unexpected login service result", async () => {
    const service = { login: vi.fn().mockResolvedValue({ unexpected: true }) } as unknown as AuthService;
    const next = vi.fn();
    await new AuthController(service).login(request(), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Unexpected result from login" }));
  });

  it("requires refresh token before calling service", async () => {
    const service = { refreshToken: vi.fn() } as unknown as AuthService;
    const next = vi.fn();
    await new AuthController(service).refresh(request(), response(), next);
    expect(service.refreshToken).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Refresh token required" }));
  });

  it("requires a token when verifying 2FA", async () => {
    const service = { verify2FA: vi.fn() } as unknown as AuthService;
    const next = vi.fn();
    await new AuthController(service).verify2FA(request({ body: {} }), response(), next);
    expect(service.verify2FA).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Token is required" }));
  });

  it("requires both pre-auth token and TOTP token", async () => {
    const service = { verifyTOTP: vi.fn() } as unknown as AuthService;
    const next = vi.fn();
    await new AuthController(service).verifyTOTP(request({ body: { token: "123456" } }), response(), next);
    expect(service.verifyTOTP).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "preAuthToken and token are required" }));
  });

  it("redirects OAuth callback failures to the frontend error URL", async () => {
    const service = {} as AuthService;
    const res = response();
    await new AuthController(service).googleCallback(request({ user: null }), res);
    expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/\?error=auth_failed$/));
  });
});
