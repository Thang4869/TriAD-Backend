"use strict";

const CHECKS = [
  { path: "/health/live", status: 200, kind: "live" },
  { path: "/health/ready", status: 200, kind: "ready" },
  { path: "/api/products", status: 200, kind: "products" },
  { path: "/metrics", status: 404 },
  { path: "/api/docs", status: 404 },
];

function stagingOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("STAGING_BASE_URL must be an HTTPS origin");
  }

  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "STAGING_BASE_URL must be an HTTPS origin without credentials, path or query",
    );
  }

  return url.origin;
}

async function runStagingSmoke(baseUrl, { timeoutMs = 10_000 } = {}) {
  const origin = stagingOrigin(baseUrl);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 120_000
  ) {
    throw new Error("Smoke timeout must be an integer between 1 and 120000 ms");
  }

  const checks = [];
  for (const check of CHECKS) {
    let response;
    try {
      response = await fetch(new URL(check.path, origin), {
        method: "GET",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new Error(`${check.path}: request failed or timed out`);
    }

    if (response.status !== check.status) {
      await response.body?.cancel();
      throw new Error(
        `${check.path}: expected HTTP ${check.status}, received ${response.status}`,
      );
    }

    if (check.kind) {
      let body;
      try {
        body = await response.json();
      } catch {
        throw new Error(`${check.path}: expected a JSON response`);
      }

      const valid =
        check.kind === "products"
          ? body?.success === true
          : body?.status === "up" &&
            (check.kind === "live" ||
              ["database", "cache", "queues"].every(
                (name) => body?.components?.[name]?.status === "up",
              ));
      if (!valid) {
        throw new Error(
          `${check.path}: response did not satisfy readiness contract`,
        );
      }
    } else {
      await response.body?.cancel();
    }

    checks.push({ path: check.path, status: response.status });
  }

  return { checkedAt: new Date().toISOString(), origin, checks };
}

if (require.main === module) {
  const timeoutMs =
    process.env.STAGING_SMOKE_TIMEOUT_MS === undefined
      ? 10_000
      : Number(process.env.STAGING_SMOKE_TIMEOUT_MS);
  runStagingSmoke(process.env.STAGING_BASE_URL, { timeoutMs }).then(
    (report) => console.log(JSON.stringify(report, null, 2)),
    (error) => {
      console.error(`Staging smoke failed: ${error.message}`);
      process.exitCode = 1;
    },
  );
}

module.exports = { runStagingSmoke, stagingOrigin };
