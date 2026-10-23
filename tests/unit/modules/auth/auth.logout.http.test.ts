import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import config from "@config";
import { AuthController } from "@modules/auth/auth.controller";
import type { AuthService } from "@modules/auth/auth.service";
import { DependencyUnavailableError } from "@shared/errors/application-error";
import {
  csrfProtection,
  generateCsrfToken,
} from "@shared/middlewares/csrf.middleware";
import { authSessionFixture } from "../../../helpers/auth-session";
import { createErrorHandler } from "@shared/middlewares/error-handler.middleware";

vi.mock("@core/logger/winston", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

const credentials = authSessionFixture("logout-session");
const csrf = generateCsrfToken("logout-session");
const originalConfig = {
  isProduction: config.isProduction,
  COOKIE_DOMAIN: config.COOKIE_DOMAIN,
};

function expectClearedCookies(
  response: request.Response,
  domain: string | undefined,
) {
  const cookies = response.get("Set-Cookie") ?? [];
  expect(cookies).toHaveLength(3);

  for (const name of ["accessToken", "refreshToken", "csrfToken"]) {
    const cookie = cookies.find((value) => value.startsWith(`${name}=`));
    expect(cookie).toContain(`${name}=;`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=None");
    const expires = cookie?.match(/Expires=([^;]+)/)?.[1];
    expect(Date.parse(expires ?? "")).toBeLessThanOrEqual(Date.now());
    if (domain) expect(cookie).toContain(`Domain=${domain}`);
    else expect(cookie).not.toContain("Domain=");
    if (name === "csrfToken") expect(cookie).not.toContain("HttpOnly");
    else expect(cookie).toContain("HttpOnly");
  }
}

describe.each([undefined, ".example.invalid"])(
  "Logout HTTP cleanup (COOKIE_DOMAIN=%s)",
  (domain) => {
    let app: express.Express;
    const logout = vi.fn<AuthService["logout"]>();

    beforeEach(() => {
      Object.assign(config, { isProduction: true, COOKIE_DOMAIN: domain });
      logout.mockReset();
      logout.mockResolvedValue(undefined);
      const controller = new AuthController({
        logout,
      } as unknown as AuthService);
      app = express();
      app.use(cookieParser());
      app.use(csrfProtection);
      app.use(express.json());
      app.use((req, _res, next) => {
        // This fixture represents a request that already passed authentication.
        req.user = { id: "logout-user" };
        next();
      });
      app.post("/api/auth/logout", controller.logout);
      app.use(createErrorHandler({ classify: () => null }));
    });

    afterEach(() => {
      Object.assign(config, originalConfig);
    });

    const withCookies = () =>
      request(app)
        .post("/api/auth/logout")
        .set("Cookie", [
          `accessToken=${credentials.accessToken}`,
          `refreshToken=${credentials.refreshToken}`,
          `csrfToken=${csrf}`,
        ]);

    it("expires all browser credentials after successful revocation", async () => {
      const response = await withCookies().set("x-csrf-token", csrf).send({});

      expect(response.status).toBe(200);
      expect(logout).toHaveBeenCalledExactlyOnceWith(
        "logout-user",
        credentials.accessToken,
        credentials.refreshToken,
      );
      expectClearedCookies(response, domain);
    });

    it("expires browser credentials while preserving a revocation failure as 503", async () => {
      logout.mockRejectedValue(
        new DependencyUnavailableError("Token store unavailable"),
      );

      const response = await withCookies().set("x-csrf-token", csrf).send({});

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        success: false,
        code: "APPLICATION.DEPENDENCY_UNAVAILABLE",
      });
      expect(logout).toHaveBeenCalledExactlyOnceWith(
        "logout-user",
        credentials.accessToken,
        credentials.refreshToken,
      );
      expectClearedCookies(response, domain);
    });

    it("rejects missing CSRF before revocation or cookie cleanup", async () => {
      const response = await withCookies().send({});

      expect(response.status).toBe(403);
      expect(logout).not.toHaveBeenCalled();
      expect(response.get("Set-Cookie")).toBeUndefined();
    });
  },
);
