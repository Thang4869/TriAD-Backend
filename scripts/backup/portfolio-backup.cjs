"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { archive } = require("../acceptance/recovery-archive.cjs");

const HOST = "dpg-dbcbq8ff3r2c739hbi3g-a.singapore-postgres.render.com";
const NEON_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+neon\.tech$/i;
const IMAGE = "postgres:18-alpine";
const LOG_RETENTION = 14;

function executionId() {
  return crypto.randomUUID();
}

function redact(value) {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(
      /(PGPASSWORD|PASSWORD|RECOVERY_KEY|DATABASE_URL)=([^\r\n\s]+)/gi,
      "$1=[REDACTED]",
    )
    .replace(/\b[a-f0-9]{64}\b/gi, "[REDACTED_KEY]");
}

function classifyError(error) {
  const message = String(error && error.message ? error.message : error);
  if (
    /connection to server|ssl connection|network|dns|host|timeout|timedout|econn|enotfound|no response/i.test(
      message,
    )
  )
    return "network";
  if (/docker executable|docker daemon|container|image/i.test(message))
    return "docker";
  if (/enoent|eacces|enospc|filesystem|directory|file/i.test(message))
    return "filesystem";
  if (/password|auth|role .* does not exist/i.test(message))
    return "authentication";
  if (/archive|cipher|decrypt|encrypt|key|integrity/i.test(message))
    return "encryption";
  if (/restore|schema|migration|pg_restore/i.test(message)) return "restore";
  return "unknown";
}

function createLogger(env = process.env, id = executionId()) {
  const directory = path.join(
    env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
    "TriAD-Backup",
    "logs",
  );
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const logPath = path.join(directory, "backup-" + id + ".log");
  const stream = fs.createWriteStream(logPath, { flags: "wx", mode: 0o600 });
  const write = (level, stage, message, details) => {
    const record = {
      timestamp: new Date().toISOString(),
      executionId: id,
      level,
      stage,
      message: redact(message),
    };
    if (details)
      record.details = redact(
        typeof details === "string" ? details : JSON.stringify(details),
      );
    stream.write(JSON.stringify(record) + "\n");
  };
  const close = () =>
    new Promise((resolve) => {
      stream.end(resolve);
    });
  try {
    const files = fs
      .readdirSync(directory)
      .filter((name) => /^backup-[a-f0-9-]+\.log$/.test(name))
      .map((name) => ({
        name,
        time: fs.statSync(path.join(directory, name)).mtimeMs,
      }))
      .sort((a, b) => b.time - a.time);
    for (const file of files.slice(LOG_RETENTION))
      fs.rmSync(path.join(directory, file.name), { force: true });
  } catch (error) {
    write("WARN", "configuration", "Log rotation failed", error.message);
  }
  return { id, path: logPath, write, close };
}

function sourceEnvironment(value, sourceName = "render", fixture = false) {
  if (typeof sourceName === "boolean") {
    fixture = sourceName;
    sourceName = "render";
  }
  const url = new URL(value);
  const expected = fixture
    ? {
        host: "triad-portfolio-source",
        database: "triad_portfolio_fixture",
        user: "test",
      }
    : sourceName === "render"
      ? { host: HOST, database: "triad_staging", user: "triad_staging" }
      : sourceName === "neon"
        ? {
            host: NEON_HOST,
            database: "triad_staging",
            user: "triad_staging_owner",
          }
        : null;
  if (!expected) throw new Error("Unexpected backup source selection");
  const queryKeys = [...url.searchParams.keys()];
  const sslMode = url.searchParams.get("sslmode");
  const channelBinding = url.searchParams.get("channel_binding");
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    (expected.host instanceof RegExp
      ? !expected.host.test(url.hostname)
      : url.hostname !== expected.host) ||
    (url.port && url.port !== "5432") ||
    url.pathname !== "/" + expected.database ||
    decodeURIComponent(url.username) !== expected.user ||
    !url.password ||
    url.hash ||
    queryKeys.some((x) => !["sslmode", "channel_binding"].includes(x)) ||
    (sslMode && sslMode !== "require") ||
    (channelBinding &&
      !["require", "prefer", "disable"].includes(channelBinding))
  )
    throw new Error("Unexpected backup source");
  if (!fixture && sslMode !== "require")
    throw new Error("Remote backup source requires sslmode=require");
  const env = {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: expected.database,
    PGUSER: expected.user,
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: fixture ? "disable" : "require",
    PGCONNECT_TIMEOUT: "15",
    PGOPTIONS:
      "-c default_transaction_read_only=on -c statement_timeout=120000",
  };
  if (channelBinding) env.PGCHANNELBINDING = channelBinding;
  if (Object.values(env).some((x) => /[\r\n\0]/.test(x)))
    throw new Error("Invalid environment value");
  return env;
}
function buildEvidence({
  mode,
  sourceName,
  previousEvidence,
  sha256,
  archiveBytes,
  verifiedAt = new Date().toISOString(),
}) {
  const previousSourceIsValid =
    previousEvidence?.result === "PASS" &&
    ["render", "neon"].includes(previousEvidence.source) &&
    previousEvidence.sha256 === sha256 &&
    previousEvidence.archiveBytes === archiveBytes;
  const source =
    mode === "backup"
      ? sourceName
      : previousSourceIsValid
        ? previousEvidence.source
        : "archive";
  const sourceBackupAt =
    mode === "backup"
      ? verifiedAt
      : previousSourceIsValid
        ? previousEvidence.sourceBackupAt || previousEvidence.verifiedAt || null
        : null;

  return {
    result: "PASS",
    source,
    database: "triad_staging",
    sourceBackupAt,
    verifiedAt,
    postgresMajor: 18,
    sha256,
    archiveBytes,
    disposableRestore: true,
    limits:
      "Local logical snapshot only; no PITR, Redis backup, hosted cutover or RTO/RPO guarantee",
  };
}

function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180000,
    ...options,
  });
  if (result.error)
    throw new Error("Docker executable unavailable: " + result.error.code);
  if (result.status !== 0) {
    const detail = result.stderr ? result.stderr.toString().trim() : "";
    throw new Error(
      "Docker backup/restore step failed" + (detail ? ": " + detail : ""),
    );
  }
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
async function run(mode, env = process.env, options = {}) {
  const logger = createLogger(env);
  let currentStage = "configuration";
  const stage = (name, message) => {
    currentStage = name;
    logger.write("INFO", name, message);
  };
  stage("configuration", "Backup execution started");
  let key;
  let fixture;
  const sourceName = env.PORTFOLIO_BACKUP_SOURCE || "render";
  try {
    if (!["backup", "verify"].includes(mode))
      throw new Error("Choose backup or verify");
    key = existingOutsideRepo(env.PORTFOLIO_BACKUP_KEY_FILE);
    if (!/^[a-f0-9]{64}$/.test(fs.readFileSync(key, "utf8").trim()))
      throw new Error("Invalid recovery key");
    fixture = env.PORTFOLIO_BACKUP_FIXTURE === "true";
    if (
      fixture &&
      (env.CI !== "true" ||
        env.PORTFOLIO_BACKUP_NETWORK !== "triad-portfolio-test")
    )
      throw new Error("Fixture mode is CI-only");
    stage("configuration", "Configuration loaded");
  } catch (error) {
    logger.write("ERROR", currentStage, error.message, classifyError(error));
    await logger.close();
    throw error;
  }
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
      stage("source-validation", "Validating configured backup source");
      const source = sourceEnvironment(
        env.PORTFOLIO_BACKUP_DATABASE_URL,
        sourceName,
        fixture,
      );
      const directory = existingOutsideRepo(env.PORTFOLIO_BACKUP_DIRECTORY);
      if (!fs.statSync(directory).isDirectory())
        throw new Error("Select a backup directory");
      stage("source-validation", "Backup source validated");
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
        stage("docker-startup", "Starting disposable dump container");
        stage("postgres-dump", "Creating read-only PostgreSQL custom dump");
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
      stage("encryption", "Encrypting PostgreSQL dump");
      await archive("encrypt", dump, encrypted, key);
      // Retention is a separate, explicit operation; backup never prunes archives.
      console.log("Encrypted backup saved: " + encrypted);
      stage("encryption", "Encrypted archive published");
    } else {
      encrypted = localBackupFile(env.PORTFOLIO_BACKUP_ARCHIVE);
      stage("source-validation", "Selected local archive for verification");
    }
    stage("archive-verification", "Decrypting and verifying archive integrity");
    const receiptPath = encrypted + ".verified.json";
    let previousEvidence = null;
    if (mode === "verify" && fs.existsSync(receiptPath)) {
      try {
        previousEvidence = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
      } catch {
        // Ignore invalid old evidence; never trust its source metadata.
      }
    }
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
    stage(
      "docker-startup",
      "Starting isolated PostgreSQL 18 restore container",
    );
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
    stage("disposable-restore", "Restoring archive into disposable database");
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
      `SELECT
        EXISTS (
          SELECT 1
          FROM "_prisma_migrations"
          WHERE finished_at IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "_prisma_migrations"
          WHERE finished_at IS NULL
            AND rolled_back_at IS NULL
        )
        AND to_regclass('public.users') IS NOT NULL
        AND to_regclass('public.orders') IS NOT NULL
        AND to_regclass('public.outbox_events') IS NOT NULL;`,
    ]);
    if (verified.toString().trim() !== "t")
      throw new Error("Restored schema verification failed");
    stage("schema-verification", "Required schema verified");
    const evidence = buildEvidence({
      mode,
      sourceName,
      previousEvidence,
      sha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(encrypted))
        .digest("hex"),
      archiveBytes: fs.statSync(encrypted).size,
    });
    if (options.writeReceipt !== false) {
      fs.writeFileSync(receiptPath, JSON.stringify(evidence, null, 2), {
        mode: 0o600,
      });
    }
    console.log(
      "PASS: encrypted archive restored into a disposable PostgreSQL 18 container",
    );
    stage("cleanup", "Backup verification completed successfully");
    return { encrypted, evidence };
  } catch (error) {
    logger.write(
      "ERROR",
      currentStage,
      error.message,
      "category=" + classifyError(error),
    );
    throw error;
  } finally {
    stage("cleanup", "Removing disposable containers and temporary files");
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
    await logger.close();
  }
}
if (require.main === module)
  run(process.argv[2]).catch((error) => {
    console.error(
      "Backup/verification FAILED [" +
        classifyError(error) +
        "]: " +
        redact(error.message),
    );
    console.error(
      "See the per-execution log under %LOCALAPPDATA%\\TriAD-Backup\\logs.",
    );
    process.exitCode = 1;
  });
module.exports = {
  sourceEnvironment,
  localBackupFile,
  buildEvidence,
  run,
  classifyError,
  redact,
  createLogger,
};
