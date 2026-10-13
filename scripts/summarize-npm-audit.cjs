"use strict";

const fs = require("node:fs");

const severities = ["critical", "high", "moderate", "low", "info"];

function summarizeReport(data) {
  if (
    !data ||
    typeof data !== "object" ||
    data.error ||
    !data.metadata ||
    !data.metadata.vulnerabilities ||
    typeof data.vulnerabilities !== "object"
  ) {
    throw new Error("npm audit did not return a valid vulnerability report");
  }

  const counts = Object.fromEntries(
    severities.map((severity) => [
      severity,
      Number(data.metadata.vulnerabilities[severity] ?? 0),
    ]),
  );

  const direct = Object.entries(data.vulnerabilities)
    .filter(([, entry]) => entry && entry.isDirect === true)
    .map(([name, entry]) => ({
      name,
      severity: entry.severity,
      fixAvailable: entry.fixAvailable,
    }))
    .sort(
      (a, b) =>
        severities.indexOf(a.severity) - severities.indexOf(b.severity) ||
        a.name.localeCompare(b.name),
    );
  return { counts, direct };
}

function markdownSummary(production, all) {
  const rows = [
    "## Dependency audit (lockfile)",
    "",
    "This is a report-only baseline, not proof that dependencies are safe.",
    "",
    "| Severity | Production | All dependencies |",
    "| --- | ---: | ---: |",
    ...severities.map(
      (severity) =>
        `| ${severity} | ${production.counts[severity]} | ${all.counts[severity]} |`,
    ),
    "",
    "### Direct production dependencies with advisories",
    "",
  ];
  if (production.direct.length === 0) {
    rows.push("None in this report.");
  } else {
    rows.push("| Package | Severity | Fix available |");
    rows.push("| --- | --- | --- |");
    for (const entry of production.direct) {
      const fix =
        entry.fixAvailable === true
          ? "yes"
          : entry.fixAvailable === false
            ? "no"
            : "requires version review";
      rows.push(`| ${entry.name} | ${entry.severity} | ${fix} |`);
    }
  }
  rows.push("", "Do not use `npm audit fix --force` without regression testing.", "");
  return rows.join("\n");
}

function main(paths) {
  if (paths.length !== 2) {
    throw new Error("Usage: node summarize-npm-audit.cjs <production.json> <all.json>");
  }
  const [prod, all] = paths.map((file) =>
    summarizeReport(JSON.parse(fs.readFileSync(file, "utf8"))),
  );
  const markdown = markdownSummary(prod, all);
  process.stdout.write(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { summarizeReport, markdownSummary };
