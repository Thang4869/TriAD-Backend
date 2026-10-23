/**
 * B7 isolated Redis + real HTTP proxy acceptance. No shared resources.
 * Requires a disposable Docker Redis on loopback:16379 and explicit opt-in.
 */
"use strict";
const assert = require("node:assert/strict");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const express = require("express");

if (process.env.B7_ACCEPTANCE_ENABLED !== "true" ||
    process.env.NODE_ENV !== "test" ||
    process.env.REDIS_URL !== "redis://127.0.0.1:16379" ||
    !/^triad-b7-redis-[a-zA-Z0-9-]+$/.test(process.env.B7_REDIS_CONTAINER || "")) {
  throw new Error("B7 drill requires the disposable CI Redis, never staging");
}
const redis = require("../../src/core/redis/client").default;
const { rateLimiter } = require("../../src/shared/middlewares/rate-limit.middleware");
const { idempotencyMiddleware } = require("../../src/shared/middlewares/idempotency.middleware");
const { parseTrustProxy } = require("../../src/config/trust-proxy");
const { createErrorHandler } = require("../../src/shared/middlewares/error-handler.middleware");
const { rateLimitStoreFailuresTotal } = require("../../src/core/metrics/metrics.registry");
const dockerName = process.env.B7_REDIS_CONTAINER;
const prefix = "ratelimit:b7:" + randomUUID() + ":";
const evidence = [], servers = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", timeout: 25000 }).trim();

function makeApp(trust, scope, max) {
  const app = express();
  app.set("trust proxy", parseTrustProxy(trust));
  app.get("/health/live", (_req, res) => res.json({ status: "up" }));
  app.get("/health/ready", async (_req, res) => {
    try {
      const value = await Promise.race([
        redis.ping(),
        wait(550).then(() => { throw new Error("timeout"); }),
      ]);
      res.status(value === "PONG" ? 200 : 503).json({ status: value === "PONG" ? "up" : "down" });
    } catch {
      res.status(503).json({ status: "down" });
    }
  });
  app.use("/api", rateLimiter({ prefix: prefix + scope + ":", windowMs: 60000, max }));
  app.get("/api/probe", (req, res) => res.json({ success: true, ip: req.ip }));
  app.use(createErrorHandler({ classify: () => null }));
  return app;
}
async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  return server.address().port;
}
// Each HTTP hop is real. Test-only fixtures are mapped to RFC5737 addresses.
// The proxy overwrites caller-controlled forwarded headers.
const fixtureIp = {
  "shared-a": "198.51.100.20",
  "shared-b": "198.51.100.20",
  "independent": "198.51.100.21",
};
async function proxyTo(backendPort) {
  const server = http.createServer((req, res) => {
    const ip = fixtureIp[req.headers["x-ci-fixture"]];
    if (!ip) { res.writeHead(400); res.end(); return; }
    const headers = {
      ...req.headers,
      host: "127.0.0.1:" + backendPort,
      "x-forwarded-for": ip,
      "x-forwarded-proto": "http",
    };
    delete headers["x-ci-fixture"];
    const upstream = http.request({
      hostname: "127.0.0.1", port: backendPort, path: req.url,
      method: req.method, headers,
    }, (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });
  return listen(server);
}
async function probe(port, path, fixture, forged) {
  const headers = {};
  if (fixture) headers["x-ci-fixture"] = fixture;
  if (forged) headers["x-forwarded-for"] = forged;
  const start = Date.now();
  const response = await fetch("http://127.0.0.1:" + port + path, {
    headers, signal: AbortSignal.timeout(6500),
  });
  return {
    status: response.status, body: await response.json(),
    ms: Date.now() - start,
    rateLimit: response.headers.get("ratelimit-limit"),
  };
}
function record(name, ok, details) {
  assert.ok(ok, name + ": " + JSON.stringify(details));
  evidence.push({ name, result: "PASS", ...details });
  process.stdout.write("PASS " + name + " " + JSON.stringify(details) + "\n");
}
async function redisHealthy(maxWait = 20000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    if (redis.status === "ready") {
      try {
        const result = await Promise.race([
          redis.ping(),
          wait(800).then(() => { throw new Error("ping timeout"); }),
        ]);
        if (result === "PONG") return;
      } catch { /* Wait for reconnection. */ }
    }
    await wait(250);
  }
  throw new Error("Disposable Redis did not recover");
}
async function drill() {
  await redisHealthy();
  // Separate route: the idempotency store itself must fail closed, rather than
  // having the rate limiter reject the request before it reaches that store.
  let mutations = 0;
  const idemApp = express();
  idemApp.use(express.json());
  idemApp.post("/api/checkout", idempotencyMiddleware(), (_req, res) => {
    mutations += 1;
    res.status(201).json({ success: true });
  });
  idemApp.use(createErrorHandler({ classify: () => null }));
  const idemPort = await listen(http.createServer(idemApp));
  const post = async (key) => {
    const start = Date.now();
    const response = await fetch("http://127.0.0.1:" + idemPort + "/api/checkout", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": key },
      body: "{}", signal: AbortSignal.timeout(6500),
    });
    await response.arrayBuffer();
    return { status: response.status, ms: Date.now() - start };
  };
  const pausedKey = randomUUID();
  const stoppedKey = randomUUID();
  const direct = await listen(http.createServer(makeApp("0", "direct", 2)));
  const directResponses = [];
  for (const spoof of ["203.0.113.10", "198.51.100.45", "203.0.113.99"]) {
    directResponses.push(await probe(direct, "/api/probe", null, spoof));
  }
  record("direct-hostile-XFF-shares-a-429-budget",
    JSON.stringify(directResponses.map((r) => r.status)) === "[200,200,429]" &&
      directResponses[0].body.ip === directResponses[1].body.ip &&
      directResponses[0].body.ip !== "203.0.113.10",
    { status: directResponses.map((r) => r.status), trustProxy: "0" });

  const backend = await listen(http.createServer(makeApp("loopback", "proxy", 2)));
  const proxy = await proxyTo(backend);
  const a = await probe(proxy, "/api/probe", "shared-a", "203.0.113.5");
  const b = await probe(proxy, "/api/probe", "shared-b", "203.0.113.6");
  const limited = await probe(proxy, "/api/probe", "shared-a", "203.0.113.7");
  const independent = await probe(proxy, "/api/probe", "independent", "203.0.113.8");
  record("proxy-sanitizes-untrusted-forwarded-header",
    a.body.ip === "198.51.100.20" &&
      a.body.ip === b.body.ip && independent.body.ip === "198.51.100.21",
    { trustProxy: "loopback", forwardedHeaderOverwritten: true });
  record("shared-NAT-competes-but-independent-source-does-not",
    a.status === 200 && b.status === 200 && limited.status === 429 &&
      independent.status === 200 && limited.rateLimit === "2",
    { nat: [a.status,b.status,limited.status], independent: independent.status,
      tradeoff: "per-IP shared NAT can cause mutual 429 after budget exhaustion" });

  const port = await listen(http.createServer(makeApp("0", "outage", 40)));
  const initial = await probe(port, "/api/probe");
  record("real-Redis-initial-request", initial.status === 200, { status: initial.status });
  docker("pause", dockerName);
  try {
    const paused = await probe(port, "/api/probe");
    const ready = await probe(port, "/health/ready");
    const live = await probe(port, "/health/live");
    record("paused-Redis-produces-bounded-503",
      paused.status === 503 && paused.ms < 4500 &&
        paused.body.code === "APPLICATION.DEPENDENCY_UNAVAILABLE",
      { http: paused.status, elapsedMs: paused.ms });
    record("health-readiness-down-liveness-up",
      ready.status === 503 && live.status === 200,
      { ready: ready.status, live: live.status });
    const rejected = await post(pausedKey);
    record("idempotency-paused-Redis-fails-closed-without-mutation",
      rejected.status === 503 && rejected.ms < 3500 && mutations === 0,
      { http: rejected.status, elapsedMs: rejected.ms, mutations });
  } finally {
    docker("unpause", dockerName);
  }
  const unpauseStart = Date.now();
  await redisHealthy();
  const unpaused = await probe(port, "/api/probe");
  record("resume-after-Redis-unpause-without-API-restart",
    unpaused.status === 200,
    { status: unpaused.status, recoveryMs: Date.now() - unpauseStart });
  const idemResumed = await post(pausedKey);
  record("idempotency-recovers-after-unpause-without-API-restart",
    idemResumed.status === 201 && mutations === 1,
    { http: idemResumed.status, mutations });

  docker("stop", "--time", "2", dockerName);
  const stopped = await probe(port, "/api/probe");
  record("disconnected-Redis-fails-closed",
    stopped.status === 503 &&
      stopped.body.code === "APPLICATION.DEPENDENCY_UNAVAILABLE",
    { status: stopped.status });
  const idemStopped = await post(stoppedKey);
  record("idempotency-stopped-Redis-fails-closed-without-mutation",
    idemStopped.status === 503 && mutations === 1,
    { http: idemStopped.status, elapsedMs: idemStopped.ms, mutations });

  docker("start", dockerName);
  const restartStart = Date.now();
  await redisHealthy();
  const restored = await probe(port, "/api/probe");
  record("reconnected-Redis-recovers-without-API-restart",
    restored.status === 200,
    { status: restored.status, recoveryMs: Date.now() - restartStart });
  const idemRestarted = await post(stoppedKey);
  record("idempotency-recovers-after-restart-without-API-restart",
    idemRestarted.status === 201 && mutations === 2,
    { http: idemRestarted.status, mutations });

  const values = (await rateLimitStoreFailuresTotal.get()).values.filter((m) => m.value > 0);
  record("Redis-failure-metrics-avoid-user-identifiers",
    values.length > 0 && values.every((m) =>
      Object.keys(m.labels).every((key) => ["operation", "reason"].includes(key))),
    { safeSeries: values.length });
}
(async () => {
  try {
    await drill();
    const summary = {
      result: "PASS", checks: evidence.length, results: evidence,
      redis: "dedicated CI container redis:7-alpine",
      ingress: "real HTTP hop, CI fixture RFC5737 IPs (not Render infrastructure)",
    };
    fs.writeFileSync("b7-isolated-evidence.json", JSON.stringify(summary, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        "\n## B7 isolated proxy and Redis acceptance\n\n" + evidence.length +
        " checks PASS; zero skips. Network-source addresses are test fixtures, not Render ingress.\n");
    }
  } catch (e) {
    process.stderr.write("B7 acceptance failed: " + (e && e.message || "unknown") + "\n");
    process.exitCode = 1;
  } finally {
    for (const server of servers.reverse()) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    redis.disconnect();
  }
})();
