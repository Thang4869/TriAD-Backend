const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  sourceEnvironment,
  buildEvidence,
  classifyError,
  redact,
  createLogger,
} = require("../../scripts/backup/portfolio-backup.cjs");
const {
  localDateKey,
  runRetention,
} = require("../../scripts/backup/portfolio-backup-retention.cjs");
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
    "postgresql://triad_staging_owner:secret@ep-calm-band-aoiy16yn.c-2.ap-southeast-1.aws.neon.tech/triad_staging?sslmode=require&channel_binding=require";
  const env = sourceEnvironment(neon, "neon");
  assert.equal(
    env.PGHOST,
    "ep-calm-band-aoiy16yn.c-2.ap-southeast-1.aws.neon.tech",
  );
  assert.equal(env.PGUSER, "triad_staging_owner");
  assert.equal(env.PGPORT, "5432");
  assert.equal(env.PGSSLMODE, "require");
  assert.equal(env.PGCHANNELBINDING, "require");
  for (const value of [
    neon.replace(
      "ep-calm-band-aoiy16yn.c-2.ap-southeast-1.aws.neon.tech",
      "evil.example",
    ),
    neon.replace("triad_staging_owner", "triad_staging"),
    neon.replace("/triad_staging?", "/other?"),
    neon.replace("sslmode=require", "sslmode=disable"),
    neon.replace("&channel_binding=require", "&options=unsafe"),
    neon.replace(".tech/", ".tech:5433/"),
    neon.replace(
      "ep-calm-band-aoiy16yn.c-2.ap-southeast-1.aws.neon.tech",
      "neon.tech.evil.com",
    ),
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

test("verification preserves the original Render or Neon backup source", () => {
  for (const source of ["render", "neon"]) {
    const evidence = buildEvidence({
      mode: "verify",
      previousEvidence: {
        result: "PASS",
        source,
        verifiedAt: "2026-11-10T01:00:00.000Z",
        sha256: "a".repeat(64),
        archiveBytes: 1234,
      },
      sha256: "a".repeat(64),
      archiveBytes: 1234,
      verifiedAt: "2026-11-10T02:00:00.000Z",
    });
    assert.equal(evidence.source, source);
    assert.equal(evidence.sourceBackupAt, "2026-11-10T01:00:00.000Z");
    assert.equal(evidence.verifiedAt, "2026-11-10T02:00:00.000Z");
  }
});

test("verification does not inherit a source from a mismatched receipt", () => {
  const evidence = buildEvidence({
    mode: "verify",
    previousEvidence: {
      result: "PASS",
      source: "render",
      verifiedAt: "2026-11-10T01:00:00.000Z",
      sha256: "b".repeat(64),
      archiveBytes: 1234,
    },
    sha256: "a".repeat(64),
    archiveBytes: 1234,
    verifiedAt: "2026-11-10T02:00:00.000Z",
  });
  assert.equal(evidence.source, "archive");
  assert.equal(evidence.sourceBackupAt, null);
});

test("a new backup records its selected source and source backup timestamp", () => {
  const evidence = buildEvidence({
    mode: "backup",
    sourceName: "neon",
    sha256: "a".repeat(64),
    archiveBytes: 1234,
    verifiedAt: "2026-11-10T02:00:00.000Z",
  });
  assert.equal(evidence.source, "neon");
  assert.equal(evidence.sourceBackupAt, "2026-11-10T02:00:00.000Z");
  assert.equal(evidence.verifiedAt, "2026-11-10T02:00:00.000Z");
});


function makeRetentionFixture(directory, timestamp, source, suffix, options = {}) {
  const stamp = timestamp.replace(/[-:.]/g, "");
  const name = "triad-portfolio-" + stamp + "-" + suffix + ".dump.enc";
  const archivePath = path.join(directory, name);
  const bytes = Buffer.from(options.content || "encrypted-fixture-" + suffix);
  fs.writeFileSync(archivePath, bytes, { mode: 0o600 });
  const receipt = {
    result: "PASS",
    source,
    database: "triad_staging",
    sourceBackupAt: timestamp,
    verifiedAt: new Date(Date.parse(timestamp) + 1000).toISOString(),
    postgresMajor: 18,
    sha256: require("node:crypto").createHash("sha256").update(bytes).digest("hex"),
    archiveBytes: bytes.length,
    disposableRestore: true,
  };
  if (options.invalidSource) receipt.source = options.invalidSource;
  fs.writeFileSync(
    archivePath + ".verified.json",
    JSON.stringify(receipt, null, 2),
    { mode: 0o600 },
  );
  return { archivePath, receiptPath: archivePath + ".verified.json", receipt };
}

test("retention groups by ICT calendar day and keeps unknown or unverified archives", async () => {
  assert.equal(localDateKey("2026-11-13T16:59:59.000Z"), "2026-11-13");
  assert.equal(localDateKey("2026-11-13T17:00:00.000Z"), "2026-11-14");

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "triad-retention-plan-"));
  const directory = path.join(temporary, "archives");
  const keyFile = path.join(temporary, "recovery.key");
  fs.mkdirSync(directory);
  fs.writeFileSync(keyFile, "a".repeat(64), { mode: 0o600 });

  try {
    const older = makeRetentionFixture(directory, "2026-11-13T00:00:00.000Z", "render", "00000001");
    const middle = makeRetentionFixture(directory, "2026-11-13T00:30:00.000Z", "render", "00000002");
    const newest = makeRetentionFixture(directory, "2026-11-13T01:00:00.000Z", "render", "00000003");
    const neon = makeRetentionFixture(directory, "2026-11-13T01:10:00.000Z", "neon", "00000004");
    const previousDay = makeRetentionFixture(directory, "2026-11-12T01:00:00.000Z", "render", "00000005");
    const unknown = makeRetentionFixture(directory, "2026-11-13T01:20:00.000Z", "render", "00000006", { invalidSource: "archive" });
    const unverified = path.join(directory, "triad-portfolio-20261113T013000000Z-00000007.dump.enc");
    fs.writeFileSync(unverified, "no receipt");
    const badChecksum = makeRetentionFixture(directory, "2026-11-13T01:40:00.000Z", "render", "00000008");
    fs.appendFileSync(badChecksum.archivePath, "tampered");
    const wrongDate = makeRetentionFixture(directory, "2026-11-13T01:50:00.000Z", "render", "00000009");
    const wrongDateReceipt = JSON.parse(fs.readFileSync(wrongDate.receiptPath, "utf8"));
    wrongDateReceipt.sourceBackupAt = "2026-11-12T01:50:00.000Z";
    fs.writeFileSync(wrongDate.receiptPath, JSON.stringify(wrongDateReceipt));

    let verifiedCount = 0;
    const result = await runRetention({
      directory,
      keyFile,
      dryRun: true,
      verifyArchive: async ({ candidate }) => {
        verifiedCount += 1;
        return { evidence: candidate.receipt };
      },
    });

    assert.equal(result.groupsReviewed, 1);
    assert.equal(verifiedCount, 1);
    assert.deepEqual(
      result.planned.map((item) => item.archive).sort(),
      [path.basename(older.archivePath), path.basename(middle.archivePath)].sort(),
    );
    assert.equal(result.deleted.length, 0);
    for (const item of [older, middle, newest, neon, previousDay, unknown]) {
      assert.equal(fs.existsSync(item.archivePath), true);
      assert.equal(fs.existsSync(item.receiptPath), true);
    }
    assert.equal(fs.existsSync(unverified), true);
    assert.ok(result.protectedFiles.includes(path.basename(unknown.archivePath)));
    assert.ok(result.protectedFiles.includes(path.basename(unverified)));
    assert.ok(result.protectedFiles.includes(path.basename(badChecksum.archivePath)));
    assert.ok(result.protectedFiles.includes(path.basename(wrongDate.archivePath)));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("retention apply deletes only older verified archives after keeper restore passes", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "triad-retention-apply-"));
  const directory = path.join(temporary, "archives");
  const keyFile = path.join(temporary, "recovery.key");
  fs.mkdirSync(directory);
  fs.writeFileSync(keyFile, "b".repeat(64), { mode: 0o600 });

  try {
    const older = makeRetentionFixture(directory, "2026-11-13T02:00:00.000Z", "neon", "00000011");
    const keeper = makeRetentionFixture(directory, "2026-11-13T03:00:00.000Z", "neon", "00000012");
    const result = await runRetention({
      directory,
      keyFile,
      dryRun: false,
      verifyArchive: async ({ candidate }) => ({ evidence: candidate.receipt }),
    });

    assert.equal(result.failures.length, 0);
    assert.equal(result.deleted.length, 1);
    assert.equal(fs.existsSync(older.archivePath), false);
    assert.equal(fs.existsSync(older.receiptPath), false);
    assert.equal(fs.existsSync(keeper.archivePath), true);
    assert.equal(fs.existsSync(keeper.receiptPath), true);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("retention preserves every archive when the newest same-day restore fails", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "triad-retention-fail-"));
  const directory = path.join(temporary, "archives");
  const keyFile = path.join(temporary, "recovery.key");
  fs.mkdirSync(directory);
  fs.writeFileSync(keyFile, "c".repeat(64), { mode: 0o600 });

  try {
    const older = makeRetentionFixture(directory, "2026-11-13T04:00:00.000Z", "render", "00000021");
    const keeper = makeRetentionFixture(directory, "2026-11-13T05:00:00.000Z", "render", "00000022");
    const result = await runRetention({
      directory,
      keyFile,
      dryRun: false,
      verifyArchive: async () => {
        throw new Error("synthetic restore failure");
      },
    });

    assert.equal(result.deleted.length, 0);
    assert.equal(result.failures.length, 1);
    assert.equal(fs.existsSync(older.archivePath), true);
    assert.equal(fs.existsSync(older.receiptPath), true);
    assert.equal(fs.existsSync(keeper.archivePath), true);
    assert.equal(fs.existsSync(keeper.receiptPath), true);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
