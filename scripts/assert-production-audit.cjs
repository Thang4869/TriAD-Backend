"use strict";

const fs = require("node:fs");
const { summarizeReport } = require("./summarize-npm-audit.cjs");

/**
 * High and critical production vulnerabilities block CI.
 * Moderate and low findings remain visible in the risk summary for tracking.
 */
function assertNoHighOrCriticalProductionVulnerabilities(report) {
  summarizeReport(report);
  const { high, critical } = report.metadata.vulnerabilities;

  if (!Number.isSafeInteger(high) || high < 0) {
    throw new Error("Production audit is missing a valid high count");
  }

  if (!Number.isSafeInteger(critical) || critical < 0) {
    throw new Error("Production audit is missing a valid critical count");
  }

  if (high > 0 || critical > 0) {
    throw new Error(
      `Production npm audit reports ${high} high and ${critical} critical vulnerabilities`,
    );
  }
}

if (require.main === module) {
  try {
    if (process.argv.length !== 3) {
      throw new Error(
        "Usage: node assert-production-audit.cjs <production-audit.json>",
      );
    }
    const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    assertNoHighOrCriticalProductionVulnerabilities(report);
    process.stdout.write(
      "Production dependency audit: zero high and critical advisories\n",
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { assertNoHighOrCriticalProductionVulnerabilities };
