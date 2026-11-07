"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");

// Dedicated functional staging only. No configurable host, tokens, or mutations.
assert.equal(process.env.HOSTED_INGRESS_ACCEPTANCE, "true");
const run = process.env.GITHUB_RUN_ID;
assert.match(run || "", /^[0-9]+$/);
const url =
  "https://triad-staging-three.vercel.app/api/products?limit=1&b7_canary=hosted-429-" +
  run;
const started = Date.now();
let currentStage = "initial request";

async function hit(index, stage = currentStage) {
  const headers = { "User-Agent": "TriAD-Hosted-429/" + run };
  if (index !== undefined) {
    headers["X-Forwarded-For"] = "203.0.113." + ((index % 200) + 1);
    headers["X-Triad-Client-Ip"] = headers["X-Forwarded-For"];
    headers["X-Triad-Edge-Key"] = "forged-not-the-hosting-credential";
  }
  let response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    const result = {
      status: response.status,
      limit: Number(response.headers.get("ratelimit-limit")),
      remaining: Number(response.headers.get("ratelimit-remaining")),
      reset: Number(response.headers.get("ratelimit-reset")),
    };
    await response.arrayBuffer();
    return result;
  } catch (error) {
    const name = error && typeof error.name === "string" ? error.name : "Error";
    const message =
      error && typeof error.message === "string"
        ? error.message.slice(0, 240)
        : "No error message";
    throw new Error(stage + " failed (" + name + "): " + message);
  }
}

(async () => {
  currentStage = "initial request";
  const first = await hit(undefined, currentStage);
  assert.ok(
    [200, 429].includes(first.status),
    "Initial HTTP response had unexpected status/headers: " +
      JSON.stringify(first),
  );
  assert.ok(
    Number.isInteger(first.limit) && first.limit > 0 && first.limit <= 100,
  );
  assert.ok(
    Number.isInteger(first.remaining) &&
      first.remaining >= 0 &&
      first.remaining < first.limit,
  );
  const statuses = [first.status];
  let last = first;
  // At most 100 additional requests, four concurrent. Never change live limits.
  const count = first.status === 429 ? 0 : first.remaining + 1;
  for (let offset = 0; offset < count && !statuses.includes(429); offset += 4) {
    assert.ok(
      Date.now() - started < 50_000,
      "Hosted window verification exceeded 50 seconds",
    );
    currentStage = "rate-limit batch starting at request " + offset;
    const batch = await Promise.all(
      Array.from({ length: Math.min(4, count - offset) }, (_, i) =>
        hit(offset + i, currentStage + " item " + i),
      ),
    );
    for (const result of batch) {
      assert.ok(
        [200, 429].includes(result.status),
        "Unexpected hosted status: " + result.status,
      );
      statuses.push(result.status);
      last = result;
    }
  }
  assert.ok(
    statuses.includes(429),
    "No hosted 429 observed in the bounded source budget",
  );
  // Changing attacker-controlled XFF/edge headers must not restore the budget.
  currentStage = "spoofed-header verification";
  const spoofed = [
    await hit(211, currentStage + " request 1"),
    await hit(212, currentStage + " request 2"),
  ];
  assert.deepEqual(
    spoofed.map((x) => x.status),
    [429, 429],
  );
  const evidence = {
    result: "PASS",
    environment: "hosted-staging",
    run,
    limit: first.limit,
    initialRemaining: first.remaining,
    initiallyLimited: first.status === 429,
    requests: statuses.length + 2,
    accepted: statuses.filter((x) => x === 200).length,
    denied: statuses.filter((x) => x === 429).length + 2,
    spoofedAfterExhaustion: [429, 429],
    resetSeconds: last.reset,
    elapsedMs: Date.now() - started,
  };
  fs.writeFileSync(
    "hosted-ingress-429-evidence.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    "PASS hosted 429 and spoof-resistant source budget " +
      JSON.stringify(evidence),
  );
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      "\nHosted staging 429 PASS; changing XFF/edge headers remains 429. " +
        evidence.requests +
        " bounded GETs; no business mutations or real addresses published.\n",
    );
})().catch((error) => {
  const name = error && typeof error.name === "string" ? error.name : "Error";
  const message =
    error && typeof error.message === "string"
      ? error.message.slice(0, 400)
      : "No error message";
  console.error(
    "Hosted ingress acceptance failed at " +
      currentStage +
      " after " +
      (Date.now() - started) +
      "ms (" +
      name +
      "): " +
      message,
  );
  process.exitCode = 1;
});
