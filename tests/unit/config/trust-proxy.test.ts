import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { parseTrustProxy } from "@config/trust-proxy";

describe("TRUST_PROXY boundary (B10 / B7)", () => {
  it.each([
    ["0", 0],
    ["1", 1],
    ["2", 2],
    ["16", 16],
  ])("parses a bounded hop count %s", (input, expected) => {
    expect(parseTrustProxy(input)).toBe(expected);
  });

  it("accepts explicit IPv4 proxy networks and loopback addresses", () => {
    expect(parseTrustProxy(" 10.0.0.0/8, 192.0.2.4, ::1 ")).toEqual([
      "10.0.0.0/8",
      "192.0.2.4",
      "::1",
    ]);
    expect(parseTrustProxy("loopback")).toEqual(["loopback"]);
  });

  it.each([
    "",
    "true",
    "false",
    "all",
    "999",
    "01",
    "0.0.0.0/0",
    "::/0",
    "::/1",
    "::ffff:10.0.0.0/8",
    "::ffff:10.0.0.0/104",
    "uniquelocal",
    "10.0.0.0/33",
    "10.0.0.0/8,,192.0.2.1",
  ])("rejects unsafe or ambiguous proxy trust configuration: %s", (input) => {
    expect(() => parseTrustProxy(input)).toThrow(/Invalid TRUST_PROXY/);
  });

  it("does not accept spoofed X-Forwarded-For when no proxy is trusted", async () => {
    const app = express();
    app.set("trust proxy", parseTrustProxy("0"));
    app.get("/ip", (req, res) => res.json({ ip: req.ip }));

    const response = await request(app)
      .get("/ip")
      .set("X-Forwarded-For", "198.51.100.77");
    expect(response.status).toBe(200);
    expect(response.body.ip).not.toBe("198.51.100.77");
  });

  it("trusts forwarded headers only for a deliberately configured proxy hop", async () => {
    const app = express();
    app.set("trust proxy", parseTrustProxy("1"));
    app.get("/ip", (req, res) => res.json({ ip: req.ip }));

    const response = await request(app)
      .get("/ip")
      .set("X-Forwarded-For", "198.51.100.77");
    expect(response.status).toBe(200);
    expect(response.body.ip).toBe("198.51.100.77");
  });
  it("ignores spoofed forwarded IPs when the immediate peer is not allowlisted", async () => {
    const app = express();
    app.set("trust proxy", parseTrustProxy("192.0.2.0/24"));
    app.get("/ip", (req, res) => res.json({ ip: req.ip }));
    const response = await request(app)
      .get("/ip")
      .set("X-Forwarded-For", "198.51.100.77");
    expect(response.status).toBe(200);
    expect(response.body.ip).not.toBe("198.51.100.77");
  });

  it("does not let client-provided earlier hops override the nearest trusted hop", async () => {
    const app = express();
    app.set("trust proxy", parseTrustProxy("1"));
    app.get("/ip", (req, res) => res.json({ ip: req.ip }));
    const response = await request(app)
      .get("/ip")
      .set("X-Forwarded-For", "203.0.113.9, 198.51.100.77");
    expect(response.status).toBe(200);
    expect(response.body.ip).toBe("198.51.100.77");
  });
});
