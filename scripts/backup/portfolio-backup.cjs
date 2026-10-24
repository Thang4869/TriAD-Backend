"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { archive } = require("../acceptance/recovery-archive.cjs");

const HOST = "dpg-dbcbq8ff3r2c739hbi3g-a.singapore-postgres.render.com";
const IMAGE = "postgres:18-alpine";
function sourceEnvironment(value, fixture = false) {
  const url = new URL(value);
  const expected = fixture
    ? {
        host: "triad-portfolio-source",
        database: "triad_portfolio_fixture",
        user: "test",
      }
    : { host: HOST, database: "triad_staging", user: "triad_staging" };
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== expected.host ||
    (url.port && url.port !== "5432") ||
    url.pathname !== "/" + expected.database ||
    decodeURIComponent(url.username) !== expected.user ||
    !url.password ||
    url.hash ||
    [...url.searchParams.keys()].some((x) => x !== "sslmode") ||
    (url.search && url.search !== "?sslmode=require")
  )
    throw new Error("Unexpected backup source");
  const env = {
    PGHOST: url.hostname,
    PGPORT: "5432",
    PGDATABASE: expected.database,
    PGUSER: expected.user,
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: fixture ? "disable" : "require",
    PGCONNECT_TIMEOUT: "15",
    PGOPTIONS:
      "-c default_transaction_read_only=on -c statement_timeout=120000",
  };
  if (Object.values(env).some((x) => /[\r\n\0]/.test(x)))
    throw new Error("Invalid environment value");
  return env;
}
function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180000,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error("Docker backup/restore step failed");
  return result.stdout;
}
function existingOutsideRepo(value) {
  const location = fs.realpathSync(value);
  const repository = fs.realpathSync(path.resolve(__dirname, "../.."));
  const relative = path.relative(repository, location);
  if (
    !relative ||
    (!relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  )
    throw new Error("Backup material must be outside the repository");
  return location;
}
function localBackupFile(value) {
  const file = existingOutsideRepo(value);
  if (
    !/^triad-portfolio-\d{8}T\d{9}Z-[a-f0-9]{8}\.dump\.enc$/.test(
      path.basename(file),
    ) ||
    !fs.statSync(file).isFile()
  )
    throw new Error("Select a portfolio backup archive");
  return file;
}
async function run(mode, env = process.env) {
  if (!["backup", "verify"].includes(mode))
    throw new Error("Choose backup or verify");
  const key = existingOutsideRepo(env.PORTFOLIO_BACKUP_KEY_FILE);
  if (!/^[a-f0-9]{64}$/.test(fs.readFileSync(key, "utf8").trim()))
    throw new Error("Invalid recovery key");
  const fixture = env.PORTFOLIO_BACKUP_FIXTURE === "true";
  if (
    fixture &&
    (env.CI !== "true" ||
      env.PORTFOLIO_BACKUP_NETWORK !== "triad-portfolio-test")
  )
    throw new Error("Fixture mode is CI-only");
  const network = fixture ? ["--network", "triad-portfolio-test"] : [];
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "triad-portfolio-"));
  fs.chmodSync(temporary, 0o700);
  const target =
    "triad-portfolio-verify-" + crypto.randomBytes(8).toString("hex");
  let targetStarted = false;
  const dumper =
    "triad-portfolio-dump-" + crypto.randomBytes(8).toString("hex");
  try {
    let encrypted;
    if (mode === "backup") {
      const source = sourceEnvironment(
        env.PORTFOLIO_BACKUP_DATABASE_URL,
        fixture,
      );
      const directory = existingOutsideRepo(env.PORTFOLIO_BACKUP_DIRECTORY);
      if (!fs.statSync(directory).isDirectory())
        throw new Error("Select a backup directory");
      const envFile = path.join(temporary, "source.env");
      fs.writeFileSync(
        envFile,
        Object.entries(source)
          .map(([k, v]) => k + "=" + v)
          .join("\n"),
        { mode: 0o600 },
      );
      const dump = path.join(temporary, "source.dump");
      const fd = fs.openSync(dump, "wx", 0o600);
      try {
        docker(
          [
            "run",
            "--rm",
            "--name",
            dumper,
            ...network,
            "--env-file",
            envFile,
            IMAGE,
            "pg_dump",
            "--format=custom",
            "--no-owner",
            "--no-acl",
            "--no-password",
            "--lock-wait-timeout=10s",
          ],
          { stdio: ["ignore", fd, "pipe"] },
        );
      } finally {
        fs.closeSync(fd);
      }
      const stamp = new Date().toISOString().replace(/[-:.]/g, "");
      encrypted = path.join(
        directory,
        "triad-portfolio-" +
          stamp +
          "-" +
          crypto.randomBytes(4).toString("hex") +
          ".dump.enc",
      );
      await archive("encrypt", dump, encrypted, key);
      // Never prune old backups automatically. The owner keeps known-good copies.
      console.log("Encrypted backup saved: " + encrypted);
    } else {
      encrypted = localBackupFile(env.PORTFOLIO_BACKUP_ARCHIVE);
    }
    fs.rmSync(encrypted + ".verified.json", { force: true });
    const restored = path.join(temporary, "restored.dump");
    await archive("decrypt", encrypted, restored, key);
    // The restore destination is always a fresh, randomly named local container.
    // No target URL, network exposure, application, worker or relay is accepted.
    const targetEnv = path.join(temporary, "target.env");
    fs.writeFileSync(
      targetEnv,
      "POSTGRES_USER=test\nPOSTGRES_PASSWORD=" +
        crypto.randomBytes(24).toString("hex") +
        "\nPOSTGRES_DB=triad_portfolio_verify\n",
      { mode: 0o600 },
    );
    targetStarted = true;
    docker([
      "run",
      "-d",
      "--name",
      target,
      "--network",
      "none",
      "--env-file",
      targetEnv,
      IMAGE,
    ]);
    let ready = false;
    for (let i = 0; i < 30; i++) {
      const probe = spawnSync(
        "docker",
        [
          "exec",
          target,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-U",
          "test",
          "-d",
          "triad_portfolio_verify",
        ],
        { stdio: "ignore", timeout: 5000 },
      );
      if (probe.status === 0) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!ready)
      throw new Error("Disposable restore database did not become ready");
    const fd = fs.openSync(restored, "r");
    try {
      docker(
        [
          "exec",
          "-i",
          target,
          "pg_restore",
          "-U",
          "test",
          "-d",
          "triad_portfolio_verify",
          "--no-owner",
          "--no-acl",
          "--exit-on-error",
        ],
        { stdio: [fd, "pipe", "pipe"] },
      );
    } finally {
      fs.closeSync(fd);
    }
    const verified = docker([
      "exec",
      target,
      "psql",
      "-U",
      "test",
      "-d",
      "triad_portfolio_verify",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      'SELECT (SELECT count(*) > 0 FROM "_prisma_migrations") AND to_regclass(\'public."User"\') IS NOT NULL AND to_regclass(\'public."Order"\') IS NOT NULL AND to_regclass(\'public."OutboxEvent"\') IS NOT NULL;',
    ]);
    if (verified.toString().trim() !== "t")
      throw new Error("Restored schema verification failed");
    const evidence = {
      result: "PASS",
      verifiedAt: new Date().toISOString(),
      postgresMajor: 18,
      sha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(encrypted))
        .digest("hex"),
      archiveBytes: fs.statSync(encrypted).size,
      disposableRestore: true,
      limits:
        "Local logical snapshot only; no PITR, Redis backup, hosted cutover or RTO/RPO guarantee",
    };
    fs.writeFileSync(
      encrypted + ".verified.json",
      JSON.stringify(evidence, null, 2),
      { mode: 0o600 },
    );
    console.log(
      "PASS: encrypted archive restored into a disposable PostgreSQL 18 container",
    );
    return { encrypted, evidence };
  } finally {
    spawnSync("docker", ["rm", "--force", "--volumes", dumper], {
      stdio: "ignore",
      timeout: 15000,
    });
    if (targetStarted)
      spawnSync("docker", ["rm", "--force", "--volumes", target], {
        stdio: "ignore",
        timeout: 15000,
      });
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
if (require.main === module)
  run(process.argv[2]).catch(() => {
    console.error(
      "Backup/verification FAILED. Check Docker, source access, key and free disk space. No hosted restore was attempted.",
    );
    process.exitCode = 1;
  });
module.exports = { sourceEnvironment, localBackupFile, run };
