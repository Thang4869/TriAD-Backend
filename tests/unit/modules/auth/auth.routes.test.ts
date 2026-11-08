import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

const mocks = vi.hoisted(() => ({
  config: {
    FRONTEND_URL: "https://frontend.example",
    GOOGLE_CLIENT_ID: undefined as string | undefined,
    GOOGLE_CLIENT_SECRET: undefined as string | undefined,
    FACEBOOK_APP_ID: undefined as string | undefined,
    FACEBOOK_APP_SECRET: undefined as string | undefined,
  },
  issue: vi.fn(),
  authenticate: vi.fn(() => vi.fn()),
  authController: {
    register: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    csrf: vi.fn(),
    enable2FA: vi.fn(),
    verify2FA: vi.fn(),
    verifyTOTP: vi.fn(),
    googleCallback: vi.fn(),
    facebookCallback: vi.fn(),
  },
  authMiddleware: vi.fn(),
}));

vi.mock("@config/index", () => ({ config: mocks.config }));
vi.mock("@/container", () => ({
  authController: mocks.authController,
  authMiddleware: mocks.authMiddleware,
  oauthStateStore: { issue: mocks.issue },
}));
vi.mock("@shared/middlewares/validation.middleware", () => ({
  validate: vi.fn(() => vi.fn()),
}));
vi.mock("@shared/middlewares/rate-limit.middleware", () => ({
  authRateLimiter: vi.fn(),
  authIpRateLimiter: vi.fn(),
  totpRateLimiter: vi.fn(),
  totpIpRateLimiter: vi.fn(),
  refreshRateLimiter: vi.fn(),
}));
vi.mock("@shared/middlewares/csrf.middleware", () => ({
  csrfProtection: vi.fn(),
}));
vi.mock("@modules/auth/strategies/oauth2.strategy", () => ({
  default: { authenticate: mocks.authenticate },
}));

import { authRoutes } from "@modules/auth/auth.routes";

function routeHandler(path: string) {
  const layer = (authRoutes as unknown as {
    stack: Array<{
      route?: {
        path: string;
        stack: Array<{ handle: (req: Request, res: Response, next: NextFunction) => unknown }>;
      };
    }>;
  }).stack.find((entry) => entry.route?.path === path);
  if (!layer?.route) throw new Error(`Route not found: ${path}`);
  return layer.route.stack[0].handle;
}

describe("authRoutes OAuth start handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.GOOGLE_CLIENT_ID = undefined;
    mocks.config.GOOGLE_CLIENT_SECRET = undefined;
    mocks.config.FACEBOOK_APP_ID = undefined;
    mocks.config.FACEBOOK_APP_SECRET = undefined;
    mocks.issue.mockResolvedValue("issued-state");
    mocks.authenticate.mockReturnValue(vi.fn());
  });

  it.each([
    ["/google", "GOOGLE"],
    ["/facebook", "FACEBOOK"],
  ] as const)("redirects %s when provider credentials are unavailable", async (path) => {
    const redirect = vi.fn();
    await routeHandler(path)({} as Request, { redirect } as unknown as Response, vi.fn());

    expect(redirect).toHaveBeenCalledWith(
      "https://frontend.example?error=oauth_unavailable",
    );
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("issues Google state and starts authentication with profile and email scopes", async () => {
    mocks.config.GOOGLE_CLIENT_ID = "google-client";
    mocks.config.GOOGLE_CLIENT_SECRET = "google-secret";
    const middleware = vi.fn();
    mocks.authenticate.mockReturnValue(middleware);
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn();

    await routeHandler("/google")(req, res, next);

    expect(mocks.issue).toHaveBeenCalledWith("GOOGLE");
    expect(mocks.authenticate).toHaveBeenCalledWith("google", {
      scope: ["profile", "email"],
      session: false,
      state: "issued-state",
    });
    expect(middleware).toHaveBeenCalledWith(req, res, next);
  });

  it("issues Facebook state and starts authentication with email scope", async () => {
    mocks.config.FACEBOOK_APP_ID = "facebook-client";
    mocks.config.FACEBOOK_APP_SECRET = "facebook-secret";
    const middleware = vi.fn();
    mocks.authenticate.mockReturnValue(middleware);
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn();

    await routeHandler("/facebook")(req, res, next);

    expect(mocks.issue).toHaveBeenCalledWith("FACEBOOK");
    expect(mocks.authenticate).toHaveBeenCalledWith("facebook", {
      scope: ["email"],
      session: false,
      state: "issued-state",
    });
    expect(middleware).toHaveBeenCalledWith(req, res, next);
  });

  it("forwards OAuth state-store failures to Express error handling", async () => {
    const error = new Error("state store unavailable");
    mocks.config.GOOGLE_CLIENT_ID = "google-client";
    mocks.config.GOOGLE_CLIENT_SECRET = "google-secret";
    mocks.issue.mockRejectedValue(error);
    const next = vi.fn();

    await routeHandler("/google")({} as Request, {} as Response, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });
});
