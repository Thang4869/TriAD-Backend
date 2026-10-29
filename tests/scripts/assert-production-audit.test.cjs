"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  assertNoHighOrCriticalProductionVulnerabilities,
} = require("../../scripts/assert-production-audit.cjs");

function makeReport(overrides = {}) {
  return {
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        ...overrides,
      },
    },
    vulnerabilities: {},
  };
}

describe("assertNoHighOrCriticalProductionVulnerabilities", () => {
  it("allows zero high and critical vulnerabilities", () => {
    assert.doesNotThrow(() =>
      assertNoHighOrCriticalProductionVulnerabilities(makeReport()),
    );
  });

  it("rejects high vulnerabilities", () => {
    assert.throws(
      () =>
        assertNoHighOrCriticalProductionVulnerabilities(
          makeReport({ high: 1 }),
        ),
      /1 high and 0 critical/,
    );
  });

  it("rejects critical vulnerabilities", () => {
    assert.throws(
      () =>
        assertNoHighOrCriticalProductionVulnerabilities(
          makeReport({ critical: 1 }),
        ),
      /0 high and 1 critical/,
    );
  });

  it("rejects both high and critical vulnerabilities", () => {
    assert.throws(
      () =>
        assertNoHighOrCriticalProductionVulnerabilities(
          makeReport({ high: 2, critical: 1 }),
        ),
      /2 high and 1 critical/,
    );
  });

  it("rejects an audit registry error report", () => {
    assert.throws(() =>
      assertNoHighOrCriticalProductionVulnerabilities({
        error: "EAI_AGAIN",
      }),
    );
  });

  it("rejects a report missing vulnerability metadata", () => {
    assert.throws(() =>
      assertNoHighOrCriticalProductionVulnerabilities({}),
    );
  });

  const invalidCounts = [
    ["missing high count", { high: undefined }],
    ["negative high count", { high: -1 }],
    ["non-integer high count", { high: 1.5 }],
    ["missing critical count", { critical: undefined }],
    ["negative critical count", { critical: -1 }],
    ["non-integer critical count", { critical: 1.5 }],
  ];

  for (const [description, overrides] of invalidCounts) {
    it(`rejects ${description}`, () => {
      assert.throws(() =>
        assertNoHighOrCriticalProductionVulnerabilities(
          makeReport(overrides),
        ),
      );
    });
  }
});
