"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  runStagingSmoke,
  stagingOrigin,
} = require("../../scripts/smoke-staging.cjs");

async function fixture(t, overrides = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, path: req.url });
    if (overrides[req.url]) return overrides[req.url](req, res);
    const body =
      req.url === "/health/live"
        ? { status: "up" }
        : req.url === "/health/ready"
          ? {
              status: "up",
              components: {
                database: { status: "up" },
                cache: { status: "up" },
                queues: { status: "up" },
              },
            }
          : { success: true };
    res.writeHead(["/metrics", "/api/docs"].includes(req.url) ? 404 : 200, {
      "Content-Type": "application/json",
    });
    res.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  return { origin: `http://127.0.0.1:${server.address().port}`, requests };
}

test("accepts HTTPS origins and loopback URLs for local verification", () => {
  assert.equal(
    stagingOrigin("https://staging.example.com/"),
    "https://staging.example.com",
  );
  assert.equal(stagingOrigin("http://127.0.0.1:4173"), "http://127.0.0.1:4173");
});

test("rejects insecure remote URLs, credentials and misleading API paths", () => {
  for (const input of [
    undefined,
    "not-a-url",
    "http://staging.example.com",
    "https://user:secret@staging.example.com",
    "https://staging.example.com/api",
    "https://staging.example.com/?token=secret",
    "https://staging.example.com/#token",
  ]) {
    assert.throws(
      () => stagingOrigin(input),
      (error) => {
        assert.match(error.message, /STAGING_BASE_URL/);
        assert.doesNotMatch(error.message, /secret/);
        return true;
      },
    );
  }
});

test("checks public health/API and protected routes using GET only", async (t) => {
  const { origin, requests } = await fixture(t);
  const result = await runStagingSmoke(origin);
  assert.equal(result.origin, origin);
  assert.equal(result.checks.length, 5);
  assert.ok(!Number.isNaN(Date.parse(result.checkedAt)));
  assert.deepEqual(requests, [
    { method: "GET", path: "/health/live" },
    { method: "GET", path: "/health/ready" },
    { method: "GET", path: "/api/products" },
    { method: "GET", path: "/metrics" },
    { method: "GET", path: "/api/docs" },
  ]);
});

test("rejects readiness that omits a dependency despite HTTP 200", async (t) => {
  const { origin } = await fixture(t, {
    "/health/ready": (_req, res) => res.end(JSON.stringify({ status: "up" })),
  });
  await assert.rejects(
    runStagingSmoke(origin),
    /\/health\/ready: response did not satisfy/,
  );
});

test("rejects an unhealthy queue despite aggregate readiness reporting up", async (t) => {
  const { origin } = await fixture(t, {
    "/health/ready": (_req, res) =>
      res.end(
        JSON.stringify({
          status: "up",
          components: {
            database: { status: "up" },
            cache: { status: "up" },
            queues: { status: "down" },
          },
        }),
      ),
  });
  await assert.rejects(
    runStagingSmoke(origin),
    /\/health\/ready: response did not satisfy/,
  );
});

test("rejects service-unavailable readiness", async (t) => {
  const { origin } = await fixture(t, {
    "/health/ready": (_req, res) => res.writeHead(503).end(),
  });
  await assert.rejects(
    runStagingSmoke(origin),
    /expected HTTP 200, received 503/,
  );
});

test("rejects an HTML login page returned with HTTP 200", async (t) => {
  const { origin } = await fixture(t, {
    "/api/products": (_req, res) => res.end("<html>Sign in</html>"),
  });
  await assert.rejects(
    runStagingSmoke(origin),
    /\/api\/products: expected a JSON response/,
  );
});

test("rejects an unsuccessful public API response", async (t) => {
  const { origin } = await fixture(t, {
    "/api/products": (_req, res) => res.end(JSON.stringify({ success: false })),
  });
  await assert.rejects(
    runStagingSmoke(origin),
    /\/api\/products: response did not satisfy/,
  );
});

test("detects accidentally exposed production metrics", async (t) => {
  const { origin } = await fixture(t, {
    "/metrics": (_req, res) => res.end("exposed"),
  });
  await assert.rejects(
    runStagingSmoke(origin),
    /expected HTTP 404, received 200/,
  );
});

test("does not follow redirects to a login page or another deployment", async (t) => {
  const { origin, requests } = await fixture(t, {
    "/health/live": (_req, res) =>
      res.writeHead(302, { Location: "/login" }).end(),
  });
  await assert.rejects(
    runStagingSmoke(origin),
    /\/health\/live: request failed/,
  );
  assert.equal(requests.length, 1);
});

test("bounds requests to an unresponsive deployment", async (t) => {
  const { origin } = await fixture(t, { "/health/live": () => {} });
  await assert.rejects(runStagingSmoke(origin, { timeoutMs: 50 }), /timed out/);
});

test("rejects invalid timeout configuration before making requests", async (t) => {
  const { origin, requests } = await fixture(t);
  for (const timeoutMs of [0, -1, 1.5, NaN, Infinity, 120_001]) {
    await assert.rejects(
      runStagingSmoke(origin, { timeoutMs }),
      /Smoke timeout/,
    );
  }
  assert.equal(requests.length, 0);
});

test(
  "the migration entrypoint refuses to run outside the staging environment",
  {
    skip: process.platform === "win32",
  },
  () => {
    const child = spawnSync("sh", ["scripts/start-staging.sh"], {
      cwd: require("node:path").resolve(__dirname, "../.."),
      env: { ...process.env, TRIAD_DEPLOYMENT_ENV: "production" },
      encoding: "utf8",
      timeout: 5000,
    });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /Refusing staging startup/);
  },
);

for (const exitCode of [0, 1]) {
  test(
    `starts the application only after a successful migration (exit ${exitCode})`,
    {
      skip: process.platform === "win32",
    },
    (t) => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), "triad-staging-start-"),
      );
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      fs.mkdirSync(path.join(root, "node_modules", ".bin"), {
        recursive: true,
      });
      fs.mkdirSync(path.join(root, "dist"));
      const prisma = path.join(root, "node_modules", ".bin", "prisma");
      fs.writeFileSync(
        prisma,
        `#!/bin/sh\nprintf 'MIGRATION\\n'\nexit ${exitCode}\n`,
      );
      fs.chmodSync(prisma, 0o755);
      fs.writeFileSync(
        path.join(root, "dist", "server.js"),
        "console.log('APP_STARTED');\n",
      );

      const child = spawnSync(
        "sh",
        [path.resolve(__dirname, "../../scripts/start-staging.sh")],
        {
          cwd: root,
          env: {
            ...process.env,
            TRIAD_DEPLOYMENT_ENV: "staging",
            TRIAD_SEED_STAGING_CATALOG: "false",
          },
          encoding: "utf8",
          timeout: 5000,
        },
      );
      assert.equal(child.status, exitCode);
      assert.match(child.stdout, /MIGRATION/);
      if (exitCode === 0) assert.match(child.stdout, /APP_STARTED/);
      else assert.doesNotMatch(child.stdout, /APP_STARTED/);
    },
  );
}
