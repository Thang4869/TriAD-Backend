"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  assertNoCriticalProductionVulnerabilities,
} = require("../../scripts/assert-production-audit.cjs");

function report(critical) {
  return {
    metadata: { vulnerabilities: { critical, high: 12 } },
    vulnerabilities: {},
  };
}

test("permits a valid zero-critical report even when high findings remain", () => {
  assert.doesNotThrow(() => assertNoCriticalProductionVulnerabilities(report(0)));
});

test("blocks any production critical advisory", () => {
  assert.throws(
    () => assertNoCriticalProductionVulnerabilities(report(1)),
    /1 critical vulnerabilities/,
  );
});

test("does not treat an incomplete/failed audit report as a clean scan", () => {
  assert.throws(() => assertNoCriticalProductionVulnerabilities(report(undefined)));
  assert.throws(() => assertNoCriticalProductionVulnerabilities({ error: "EAI_AGAIN" }));
});
