import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthController } from "@modules/auth/auth.controller";
import type { AuthService } from "@modules/auth/auth.service";
import {
  csrfProtection,
  generateCsrfToken,
} from "@shared/middlewares/csrf.middleware";
import { createErrorHandler } from "@shared/middlewares/error-handler.middleware";
import { authSessionFixture } from "../../../helpers/auth-session";

vi.mock("@core/logger/winston", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

describe("CSRF issuance and authenticated write HTTP boundary", () => {
  const credentials = authSessionFixture("session-1");
  const otherCredentials = authSessionFixture("session-2");
  let app: express.Express;
  const cartWrite = vi.fn();
  beforeEach(() => {
    cartWrite.mockClear();
    const controller = new AuthController({
      login: vi
        .fn()
        .mockResolvedValue({ ...credentials, user: { id: "user-1" } }),
    } as unknown as AuthService);
    app = express();
    app.use(cookieParser());
    app.use(csrfProtection);
    app.use(express.json());
    // Authentication is deliberately stubbed: real JWT verification/revocation
    // is exercised by TokenService tests and fullstack CI, not this fixture.
    app.get("/api/auth/csrf", controller.csrf);
    app.post("/api/auth/login", controller.login);
    app.all("/api/cart/items", (_req, res) => {
      cartWrite();
      res.sendStatus(204);
    });
    app.use(createErrorHandler({ classify: () => null }));
  });

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
      const response = await request(app)[method]("/api/cart/items")
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
  const rejectedTokens: Array<[string, string | undefined, string | undefined]> = [
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
