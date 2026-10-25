import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import config from "@config";
import { AuthController } from "@modules/auth/auth.controller";
import type { AuthService } from "@modules/auth/auth.service";
import {
  csrfProtection,
  generateCsrfToken,
} from "@shared/middlewares/csrf.middleware";
import { createErrorHandler } from "@shared/middlewares/error-handler.middleware";
import { AuthenticationError } from "@shared/errors/application-error";
import { authSessionFixture } from "../../../helpers/auth-session";

vi.mock("@core/logger/winston", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

describe("CSRF issuance and authenticated write HTTP boundary", () => {
  const credentials = authSessionFixture("session-1");
  const otherCredentials = authSessionFixture("session-2");
  const originalCookieConfig = {
    isProduction: config.isProduction,
    COOKIE_DOMAIN: config.COOKIE_DOMAIN,
  };
  let app: express.Express;
  const cartWrite = vi.fn();
  const login = vi.fn();
  beforeEach(() => {
    cartWrite.mockClear();
    const issued = { ...credentials, user: { id: "user-1" } };
    login.mockReset();
    login.mockResolvedValue(issued);
    const controller = new AuthController({
      login,
      verifyEmail: vi.fn().mockResolvedValue(issued),
      verifyTOTP: vi.fn().mockResolvedValue(issued),
    } as unknown as AuthService);
    app = express();
    app.use(cookieParser());
    app.use(csrfProtection);
    app.use(express.json());
    // Authentication is deliberately stubbed: real JWT verification/revocation
    // is exercised by TokenService tests and fullstack CI, not this fixture.
    app.get("/api/auth/csrf", controller.csrf);
    app.post("/api/auth/login", controller.login);
    app.get("/api/auth/verify-email", controller.verifyEmail);
    app.post("/api/auth/verify-totp", controller.verifyTOTP);
    app.all("/api/cart/items", (_req, res) => {
      cartWrite();
      res.sendStatus(204);
    });
    app.use(createErrorHandler({ classify: () => null }));
  });

  afterEach(() => {
    Object.assign(config, originalCookieConfig);
  });

  const expectedCookies = [
    ["accessToken", 900, true],
    ["refreshToken", 604800, true],
    ["csrfToken", 604800, false],
  ] as const;

  it("does not issue identity cookies during the pending two-factor challenge", async () => {
    login.mockResolvedValueOnce({
      requires2FA: true,
      preAuthToken: "disposable-preauth-fixture",
      message: "Additional verification required",
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "fixture@example.invalid", password: "fixture" });

    expect(response.status).toBe(200);
    expect(response.get("Set-Cookie")).toBeUndefined();
    expect(response.body.data.requires2FA).toBe(true);
    expect(response.body.data).not.toHaveProperty("csrfToken");
    expect(response.body.data).not.toHaveProperty("accessToken");
    expect(response.body.data).not.toHaveProperty("refreshToken");
  });

  it("does not issue cookies when authentication fails", async () => {
    login.mockRejectedValueOnce(new AuthenticationError("Invalid login"));
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "fixture@example.invalid", password: "fixture" });

    expect(response.status).toBe(401);
    expect(response.get("Set-Cookie")).toBeUndefined();
  });

  it.each([
    {
      mode: "production with host-only cookies",
      isProduction: true,
      domain: undefined,
      sameSite: "None",
    },
    {
      mode: "production with a configured cookie domain",
      isProduction: true,
      domain: ".example.invalid",
      sameSite: "None",
    },
    {
      mode: "local development with host-only cookies",
      isProduction: false,
      domain: undefined,
      sameSite: "Lax",
    },
  ])(
    "issues the three cookies with exact flags and Max-Age in $mode",
    async ({ isProduction, domain, sameSite }) => {
      Object.assign(config, { isProduction, COOKIE_DOMAIN: domain });
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: "fixture@example.invalid", password: "fixture" });

      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body.data).not.toHaveProperty("accessToken");
      expect(response.body.data).not.toHaveProperty("refreshToken");

      const cookies = response.get("Set-Cookie") ?? [];
      expect(cookies).toHaveLength(3);
      for (const [name, maxAgeSeconds, httpOnly] of expectedCookies) {
        const cookie = cookies.find((value) => value.startsWith(`${name}=`));
        expect(cookie).toBeDefined();
        const flags = cookie?.split(";").map((value) => value.trim()) ?? [];
        expect(flags).toContain(`Max-Age=${maxAgeSeconds}`);
        expect(flags).toContain("Path=/");
        expect(flags).toContain(`SameSite=${sameSite}`);
        expect(flags.includes("Secure")).toBe(isProduction);
        expect(flags.includes("HttpOnly")).toBe(httpOnly);
        if (domain) expect(flags).toContain(`Domain=${domain}`);
        else
          expect(flags.some((flag) => flag.startsWith("Domain="))).toBe(false);
      }
      expect(cookies.find((value) => value.startsWith("csrfToken="))).toContain(
        `csrfToken=${response.body.data.csrfToken};`,
      );
    },
  );

  it.each([
    ["email verification", "/api/auth/verify-email?token=fixture"],
    ["two-factor completion", "/api/auth/verify-totp"],
  ])(
    "issues session cookies after %s, without JWTs in JSON",
    async (_case, route) => {
      const response = route.includes("?")
        ? await request(app).get(route)
        : await request(app)
            .post(route)
            .send({ preAuthToken: "test-preauth", token: "123456" });

      expect(response.status).toBe(200);
      expect(response.get("Set-Cookie")).toHaveLength(3);
      expect(response.body.data.csrfToken).toMatch(/^[a-f0-9]{64}$/);
      expect(response.body.data).not.toHaveProperty("accessToken");
      expect(response.body.data).not.toHaveProperty("refreshToken");
    },
  );

  it("returns the same signed value in the JSON bootstrap and readable cookie, without JWT JSON", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "fixture@example.invalid", password: "fixture" });
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const token = response.body.data.csrfToken;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(
      response
        .get("Set-Cookie")
        ?.find((cookie) => cookie.startsWith("csrfToken=")),
    ).toContain(`csrfToken=${token};`);
    expect(response.body.data).not.toHaveProperty("accessToken");
    expect(response.body.data).not.toHaveProperty("refreshToken");
    const write = await request(app)
      .post("/api/cart/items")
      .set("Cookie", [
        `accessToken=${credentials.accessToken}`,
        `csrfToken=${token}`,
      ])
      .set("x-csrf-token", token)
      .send({});
    expect(write.status).toBe(204);
  });

  it("renews CSRF after a reload or another tab, even when a different refresh cookie is present", async () => {
    const response = await request(app)
      .get("/api/auth/csrf")
      .set("Cookie", [
        `accessToken=${credentials.accessToken}`,
        `refreshToken=${otherCredentials.refreshToken}`,
      ]);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const issuedCookies = response.get("Set-Cookie") ?? [];
    expect(issuedCookies).toHaveLength(1);
    expect(issuedCookies[0]).toContain("csrfToken=");
    expect(issuedCookies[0]).toContain("Max-Age=604800");
    expect(issuedCookies[0]).not.toContain("HttpOnly");
    expect(response.body.data).not.toHaveProperty("accessToken");
    expect(response.body.data).not.toHaveProperty("refreshToken");
    const token = response.body.data.csrfToken;
    const write = await request(app)
      .post("/api/cart/items")
      .set("Cookie", [
        `accessToken=${credentials.accessToken}`,
        `csrfToken=${token}`,
      ])
      .set("x-csrf-token", token)
      .send({});
    expect(write.status).toBe(204);
  });

  it("rejects an old session's genuine CSRF value even when cookie and header match", async () => {
    const token = generateCsrfToken("session-1");
    const response = await request(app)
      .post("/api/cart/items")
      .set("Cookie", [
        `accessToken=${otherCredentials.accessToken}`,
        `csrfToken=${token}`,
      ])
      .set("x-csrf-token", token)
      .send({});
    expect(response.status).toBe(403);
  });

  it.each(["post", "put", "patch", "delete"] as const)(
    "accepts a session-bound CSRF token for a protected %s request",
    async (method) => {
      const token = generateCsrfToken("session-1");
      const requestAgent = request(app);
      const response = await requestAgent[method]("/api/cart/items")
        .set("Cookie", [
          `accessToken=${credentials.accessToken}`,
          `csrfToken=${token}`,
        ])
        .set("x-csrf-token", token)
        .send({});

      expect(response.status).toBe(204);
      expect(cartWrite).toHaveBeenCalledOnce();
    },
  );

  const validToken = generateCsrfToken("session-1");
  const tamperedToken =
    (validToken[0] === "a" ? "b" : "a") + validToken.slice(1);
  const otherSessionToken = generateCsrfToken("session-2");
  const rejectedTokens: Array<
    [string, string | undefined, string | undefined]
  > = [
    ["missing CSRF cookie", undefined, validToken],
    ["missing CSRF header", validToken, undefined],
    ["mismatched header", validToken, otherSessionToken],
    ["matching unsigned pair", "a".repeat(64), "a".repeat(64)],
    ["tampered matching pair", tamperedToken, tamperedToken],
    ["another session's signed pair", otherSessionToken, otherSessionToken],
  ];

  it.each(rejectedTokens)(
    "rejects %s before a protected write reaches its handler",
    async (_case, cookieToken, headerToken) => {
      const cookies = [`accessToken=${credentials.accessToken}`];
      if (cookieToken !== undefined) cookies.push(`csrfToken=${cookieToken}`);
      let pending = request(app).post("/api/cart/items").set("Cookie", cookies);
      if (headerToken !== undefined)
        pending = pending.set("x-csrf-token", headerToken);

      const response = await pending.send({});
      expect(response.status).toBe(403);
      expect(cartWrite).not.toHaveBeenCalled();
    },
  );

  it("requires old access sessions without a binding to sign in again", async () => {
    const response = await request(app)
      .get("/api/auth/csrf")
      .set("Cookie", "accessToken=legacy-fixture");
    expect(response.status).toBe(401);
    expect(response.get("Set-Cookie")).toBeUndefined();
  });

  it("rejects form and text authentication before cookies can be issued", async () => {
    for (const type of ["form", "text/plain", "multipart/form-data"]) {
      const response = await request(app)
        .post("/api/auth/login")
        .type(type)
        .send("email=fixture@example.invalid&password=fixture");
      expect(response.status).toBe(403);
      expect(response.get("Set-Cookie")).toBeUndefined();
    }
  });
});
