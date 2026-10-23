import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTrustedEdgeMiddleware } from "@shared/middlewares/trusted-edge.middleware";

const secret = "disposable-edge-secret-at-least-32-characters";
function makeApp(key: string | undefined = secret) {
  const app = express();
  app.set("trust proxy", 0);
  app.use("/api", createTrustedEdgeMiddleware(key));
  app.all("/api/example", (req, res) =>
    res.json({
      ip: req.ip,
      keyPresent: "x-triad-edge-key" in req.headers,
      ipHeaderPresent: "x-triad-client-ip" in req.headers,
    }),
  );
  app.get("/health/live", (_req, res) => res.sendStatus(200));
  return app;
}

describe("authenticated API edge", () => {
  it.each([undefined, "wrong", "x".repeat(257)])(
    "rejects a direct or invalid credential",
    async (key) => {
      let req = request(makeApp())
        .get("/api/example")
        .set("X-Forwarded-For", "203.0.113.1");
      if (key) req = req.set("X-Triad-Edge-Key", key);
      expect((await req).status).toBe(403);
    },
  );
  it.each(["", "203.0.113.1, 203.0.113.2", "localhost", "203.0.113.1:80"])(
    "rejects malformed edge address %s",
    async (ip) => {
      expect(
        (
          await request(makeApp())
            .get("/api/example")
            .set("X-Triad-Edge-Key", secret)
            .set("X-Triad-Client-Ip", ip)
        ).status,
      ).toBe(403);
    },
  );
  it.each(["203.0.113.1", "2001:db8::1"])(
    "uses only the authenticated single address %s",
    async (ip) => {
      const response = await request(makeApp())
        .get("/api/example")
        .set("X-Triad-Edge-Key", secret)
        .set("X-Triad-Client-Ip", ip)
        .set("X-Forwarded-For", "198.51.100.99");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ip,
        keyPresent: false,
        ipHeaderPresent: false,
      });
    },
  );
  it("gates OPTIONS too, while health remains outside the gate", async () => {
    const app = makeApp();
    expect((await request(app).options("/api/example")).status).toBe(403);
    expect((await request(app).get("/health/live")).status).toBe(200);
  });
  it("ignores and strips edge headers when the deployment has not enabled the gate", async () => {
    const app = express();
    app.use(createTrustedEdgeMiddleware());
    app.get("/", (req, res) =>
      res.json({ ip: req.ip, key: req.headers["x-triad-edge-key"] }),
    );
    const disabled = await request(app)
      .get("/")
      .set("X-Triad-Edge-Key", secret)
      .set("X-Triad-Client-Ip", "203.0.113.1");
    expect(disabled.status).toBe(200);
    expect(disabled.body.ip).not.toBe("203.0.113.1");
    expect(disabled.body.key).toBeUndefined();
  });
});
