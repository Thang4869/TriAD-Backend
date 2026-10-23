import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import config from "@config";
import { AuthController } from "@modules/auth/auth.controller";
import type { AuthService } from "@modules/auth/auth.service";
import { refreshSchema } from "@modules/auth/dto";
import { validate } from "@shared/middlewares/validation.middleware";
import {
  csrfProtection,
  generateCsrfToken,
} from "@shared/middlewares/csrf.middleware";
import { authSessionFixture } from "../../../helpers/auth-session";
import { createErrorHandler } from "@shared/middlewares/error-handler.middleware";
import {
  AuthenticationError,
  DependencyUnavailableError,
} from "@shared/errors/application-error";

vi.mock("@core/logger/winston", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

const credentials = authSessionFixture("refresh-session");
const issuedCredentials = authSessionFixture("issued-session");
const csrf = generateCsrfToken("refresh-session");
const originalConfig = {
  isProduction: config.isProduction,
  COOKIE_DOMAIN: config.COOKIE_DOMAIN,
};

describe("Refresh HTTP validation and controller boundary", () => {
  let app: express.Express;
  const rotate = vi.fn();

  beforeEach(() => {
    Object.assign(config, { isProduction: true, COOKIE_DOMAIN: undefined });
    rotate.mockReset();
    rotate.mockResolvedValue({
      ...issuedCredentials,
      user: { id: "refresh-user", email: "refresh@example.invalid" },
    });
    const controller = new AuthController({
      refreshToken: rotate,
    } as unknown as AuthService);
    app = express();
    app.use(cookieParser());
    app.use(csrfProtection);
    app.use(express.json());
    app.post("/api/auth/refresh", validate(refreshSchema), controller.refresh);
    app.use(createErrorHandler({ classify: () => null }));
  });

  afterEach(() => {
    Object.assign(config, originalConfig);
  });

  const withCookie = () =>
    request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [
        `refreshToken=${credentials.refreshToken}`,
        `csrfToken=${csrf}`,
      ])
      .set("x-csrf-token", csrf);

  it("accepts cookie-only refresh and returns production cookie attributes without JWT JSON", async () => {
    const response = await withCookie().send({});
    expect(response.status).toBe(200);
    expect(rotate).toHaveBeenCalledExactlyOnceWith(credentials.refreshToken);
    expect(response.body.data.user.id).toBe("refresh-user");
    expect(response.body.data.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.data).not.toHaveProperty("accessToken");
    expect(response.body.data).not.toHaveProperty("refreshToken");
    const cookies = response.headers["set-cookie"] as unknown as string[];
    for (const name of ["accessToken", "refreshToken", "csrfToken"]) {
      const cookie = cookies.find((value) => value.startsWith(`${name}=`));
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=None");
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain(
        `Max-Age=${name === "accessToken" ? 900 : 604800}`,
      );
      expect(cookie).not.toContain("Domain=");
      if (name === "csrfToken") expect(cookie).not.toContain("HttpOnly");
      else expect(cookie).toContain("HttpOnly");
    }
  });

  it("retains an explicitly configured cookie domain during refresh", async () => {
    Object.assign(config, { COOKIE_DOMAIN: ".example.invalid" });
    const response = await withCookie().send({});
    expect(response.status).toBe(200);

    const cookies = response.get("Set-Cookie") ?? [];
    expect(cookies).toHaveLength(3);
    for (const name of ["accessToken", "refreshToken", "csrfToken"]) {
      const cookie = cookies.find((value) => value.startsWith(`${name}=`));
      expect(cookie).toContain("Domain=.example.invalid");
      expect(cookie).toContain("Path=/");
    }
    expect(rotate).toHaveBeenCalledExactlyOnceWith(credentials.refreshToken);
  });

  it("preserves explicit body-token clients", async () => {
    const response = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "body-refresh-fixture" });
    expect(response.status).toBe(200);
    expect(rotate).toHaveBeenCalledExactlyOnceWith("body-refresh-fixture");
  });

  it("accepts a cookie refresh without a JSON request body", async () => {
    const response = await withCookie().send();
    expect(response.status).toBe(200);
    expect(rotate).toHaveBeenCalledExactlyOnceWith(credentials.refreshToken);
  });

  it("retains cookie precedence when both credentials are provided", async () => {
    const response = await withCookie().send({
      refreshToken: "body-refresh-fixture",
    });
    expect(response.status).toBe(200);
    expect(rotate).toHaveBeenCalledExactlyOnceWith(credentials.refreshToken);
  });

  it("rejects a request with neither credential", async () => {
    const response = await request(app).post("/api/auth/refresh").send({});
    expect(response.status).toBe(400);
    expect(rotate).not.toHaveBeenCalled();
  });

  it.each(["", 123])(
    "rejects an invalid supplied body credential: %s",
    async (refreshToken) => {
      const response = await withCookie().send({ refreshToken });
      expect(response.status).toBe(400);
      expect(rotate).not.toHaveBeenCalled();
    },
  );

  it("keeps cookie refresh protected when the CSRF header is missing", async () => {
    const response = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [
        `refreshToken=${credentials.refreshToken}`,
        `csrfToken=${csrf}`,
      ])
      .send({});
    expect(response.status).toBe(403);
    expect(rotate).not.toHaveBeenCalled();
  });

  it("binds refresh CSRF to the refresh family, not an unrelated access cookie", async () => {
    const other = authSessionFixture("unrelated-access-session");
    const accessCsrf = generateCsrfToken("unrelated-access-session");
    const response = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [
        `accessToken=${other.accessToken}`,
        `refreshToken=${credentials.refreshToken}`,
        `csrfToken=${accessCsrf}`,
      ])
      .set("x-csrf-token", accessCsrf)
      .send({});

    expect(response.status).toBe(403);
    expect(rotate).not.toHaveBeenCalled();
    expect(response.get("Set-Cookie")).toBeUndefined();
  });

  it("accepts the refresh family's signed CSRF despite an unrelated access cookie", async () => {
    const other = authSessionFixture("unrelated-access-session");
    const response = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [
        `accessToken=${other.accessToken}`,
        `refreshToken=${credentials.refreshToken}`,
        `csrfToken=${csrf}`,
      ])
      .set("x-csrf-token", csrf)
      .send({});

    expect(response.status).toBe(200);
    expect(rotate).toHaveBeenCalledExactlyOnceWith(credentials.refreshToken);
  });

  it("rejects another login family's signed CSRF before rotating a refresh token", async () => {
    const otherCsrf = generateCsrfToken("another-login-session");
    const response = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [
        `refreshToken=${credentials.refreshToken}`,
        `csrfToken=${otherCsrf}`,
      ])
      .set("x-csrf-token", otherCsrf)
      .send({});

    expect(response.status).toBe(403);
    expect(rotate).not.toHaveBeenCalled();
  });

  it.each([
    [new AuthenticationError("Refresh rejected"), 401],
    [new DependencyUnavailableError("Token store unavailable"), 503],
  ])(
    "does not issue cookies when rotation fails: %s",
    async (error, status) => {
      rotate.mockRejectedValue(error);
      const response = await withCookie().send({});
      expect(response.status).toBe(status);
      expect(response.headers["set-cookie"]).toBeUndefined();
    },
  );
});
