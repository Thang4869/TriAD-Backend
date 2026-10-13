"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { summarizeReport, markdownSummary } = require("../../scripts/summarize-npm-audit.cjs");

function report(vulnerabilities, counts = {}) {
  return {
    metadata: {
      vulnerabilities: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
        ...counts,
      },
    },
    vulnerabilities,
  };
}

test("tracks direct versus transitive vulnerabilities", () => {
  const result = summarizeReport(
    report(
      {
        directPkg: { severity: "high", isDirect: true, fixAvailable: true },
        transitivePkg: { severity: "moderate", isDirect: false, fixAvailable: false },
      },
      { high: 1, moderate: 1 },
    ),
  );
  assert.equal(result.counts.high, 1);
  assert.equal(result.counts.moderate, 1);
  assert.deepEqual(result.direct, [
    { name: "directPkg", severity: "high", fixAvailable: true },
  ]);
});

test("refuses registry error JSON instead of claiming zero vulnerabilities", () => {
  assert.throws(() => summarizeReport({ error: { code: "ENOTFOUND" } }));
  assert.throws(() => summarizeReport({ metadata: {} }));
});

test("renders the production and full dependency graphs separately", () => {
  const production = summarizeReport(report({}, { critical: 1 }));
  const all = summarizeReport(report({}, { critical: 2, high: 5 }));
  const output = markdownSummary(production, all);
  assert.match(output, /\| critical \| 1 \| 2 \|/);
  assert.match(output, /\| high \| 0 \| 5 \|/);
});
