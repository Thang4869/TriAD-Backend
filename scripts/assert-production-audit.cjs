"use strict";

const fs = require("node:fs");
const { summarizeReport } = require("./summarize-npm-audit.cjs");

/**
 * Only critical production vulnerabilities block this first rollout.
 * Higher severities remain visible in the separate non-blocking summary
 * and still need explicit review/remediation.
 */
function assertNoCriticalProductionVulnerabilities(report) {
  summarizeReport(report);
  const critical = report.metadata.vulnerabilities.critical;
  if (!Number.isSafeInteger(critical) || critical < 0) {
    throw new Error("Production audit is missing a valid critical count");
  }
  if (critical !== 0) {
    throw new Error(
      `Production npm audit reports ${critical} critical vulnerabilities`,
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
    assertNoCriticalProductionVulnerabilities(report);
    process.stdout.write(
      "Production dependency audit: zero critical advisories\n",
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { assertNoCriticalProductionVulnerabilities };
