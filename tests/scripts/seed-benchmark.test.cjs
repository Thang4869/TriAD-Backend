"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readConfiguration } = require("../../scripts/performance/seed-benchmark.cjs");

const validEnv = {
  TRIAD_PERF_CONFIRM: "I_UNDERSTAND_LOCAL_BENCHMARK_DATA",
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5544/triad_perf?schema=public",
  TRIAD_PERF_RUN_ID: "local-20261110",
  TRIAD_PERF_USERS: "10",
  TRIAD_PERF_PASSWORD: "benchmark-only-password",
};

test("accepts an explicitly confirmed triad_perf database", () => {
  assert.deepEqual(readConfiguration(validEnv), {
    runId: "local-20261110",
    userCount: 10,
    password: "benchmark-only-password",
  });
});

test("refuses to seed without explicit confirmation", () => {
  assert.throws(
    () => readConfiguration({ ...validEnv, TRIAD_PERF_CONFIRM: undefined }),
    /confirmation is required/,
  );
});

test("refuses production mode", () => {
  assert.throws(
    () => readConfiguration({ ...validEnv, NODE_ENV: "production" }),
    /production environment/,
  );
});

test("refuses any database other than triad_perf", () => {
  assert.throws(
    () => readConfiguration({
      ...validEnv,
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/triad?schema=public",
    }),
    /database name must be triad_perf/,
  );
});

test("rejects invalid user counts and weak benchmark passwords", () => {
  assert.throws(
    () => readConfiguration({ ...validEnv, TRIAD_PERF_USERS: "51" }),
    /between 1 and 50/,
  );
  assert.throws(
    () => readConfiguration({ ...validEnv, TRIAD_PERF_PASSWORD: "short" }),
    /at least 12 characters/,
  );
});
