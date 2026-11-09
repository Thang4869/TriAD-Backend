const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  sourceEnvironment,
  classifyError,
  redact,
  createLogger,
} = require("../../scripts/backup/portfolio-backup.cjs");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const url =
  "postgresql://triad_staging:private@dpg-dbcbq8ff3r2c739hbi3g-a.singapore-postgres.render.com/triad_staging";
test("only backs up the selected external portfolio database over required TLS", () => {
  const env = sourceEnvironment(url + "?sslmode=require");
  assert.equal(env.PGSSLMODE, "require");
  assert.equal(env.PGDATABASE, "triad_staging");
  assert.match(env.PGOPTIONS, /default_transaction_read_only=on/);
  assert.throws(() => sourceEnvironment(url));
});
test("rejects source substitution and environment-file injection", () => {
  for (const value of [
    url.replace("singapore-postgres.render.com", "evil.example"),
    url.replace("/triad_staging", "/production"),
    url.replace("private@", "bad%0APGSSLMODE=disable@"),
    url + "?sslmode=disable",
    url + "?options=evil",
    url + "#fragment",
    url.replace("postgresql:", "https:"),
    url.replace(".com/", ".com:5433/"),
  ])
    assert.throws(() => sourceEnvironment(value));
});

test("validates the independent Neon source without weakening Render guards", () => {
  const neon =
    "postgresql://triad_staging_owner:secret@triad-zero-cost-test.neon.tech/triad_staging?sslmode=require&channel_binding=require";
  const env = sourceEnvironment(neon, "neon");
  assert.equal(env.PGHOST, "triad-zero-cost-test.neon.tech");
  assert.equal(env.PGUSER, "triad_staging_owner");
  assert.equal(env.PGPORT, "5432");
  assert.equal(env.PGSSLMODE, "require");
  assert.equal(env.PGCHANNELBINDING, "require");
  for (const value of [
    neon.replace("triad-zero-cost-test.neon.tech", "evil.example"),
    neon.replace("triad_staging_owner", "triad_staging"),
    neon.replace("/triad_staging?", "/other?"),
    neon.replace("sslmode=require", "sslmode=disable"),
    neon.replace("&channel_binding=require", "&options=unsafe"),
    neon.replace(".tech/", ".tech:5433/"),
  ])
    assert.throws(() => sourceEnvironment(value, "neon"));
  assert.throws(() =>
    sourceEnvironment(neon.replace("?sslmode=require", ""), "neon"),
  );
});

test("classifies operational failures and redacts credentials", async () => {
  assert.equal(classifyError(new Error("Docker daemon unavailable")), "docker");
  assert.equal(classifyError(new Error("connect ETIMEDOUT")), "network");
  assert.equal(
    classifyError(
      new Error(
        "Docker backup/restore step failed: connection to server failed: SSL connection has been closed unexpectedly",
      ),
    ),
    "network",
  );
  assert.equal(
    classifyError(new Error("password authentication failed")),
    "authentication",
  );
  assert.equal(
    classifyError(new Error("AES-GCM decrypt failed")),
    "encryption",
  );
  assert.equal(classifyError(new Error("pg_restore failed")), "restore");
  assert.equal(
    classifyError(new Error("EACCES: permission denied")),
    "filesystem",
  );
  assert.doesNotMatch(
    redact("postgresql://test:secret@example.test/db key=" + "a".repeat(64)),
    /secret|a{64}/,
  );
  assert.match(redact("postgresql://test:secret@example.test/db"), /REDACTED/);

  const localAppData = fs.mkdtempSync(path.join(os.tmpdir(), "triad-logs-"));
  try {
    const logger = createLogger(
      { LOCALAPPDATA: localAppData },
      "00000000-0000-0000-0000-000000000001",
    );
    logger.write("ERROR", "test", "password=secret");
    await logger.close();
    const logPath = path.join(
      localAppData,
      "TriAD-Backup",
      "logs",
      "backup-00000000-0000-0000-0000-000000000001.log",
    );
    const content = fs.readFileSync(logPath, "utf8");
    assert.match(content, /executionId/);
    assert.doesNotMatch(content, /secret/);
  } finally {
    fs.rmSync(localAppData, { recursive: true, force: true });
  }
});
