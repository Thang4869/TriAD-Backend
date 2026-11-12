"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { run: verifyBackup } = require("./portfolio-backup.cjs");

const ARCHIVE_PATTERN =
  /^triad-portfolio-(\d{8}T\d{9}Z)-([a-f0-9]{8})\.dump\.enc$/;
const RECEIPT_MAX_BYTES = 64 * 1024;
const TIME_ZONE = "Asia/Ho_Chi_Minh";

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid backup timestamp");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return fields.year + "-" + fields.month + "-" + fields.day;
}

function archiveTimestamp(stamp) {
  const value =
    stamp.slice(0, 4) +
    "-" +
    stamp.slice(4, 6) +
    "-" +
    stamp.slice(6, 8) +
    "T" +
    stamp.slice(9, 11) +
    ":" +
    stamp.slice(11, 13) +
    ":" +
    stamp.slice(13, 15) +
    "." +
    stamp.slice(15, 18) +
    "Z";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Invalid archive timestamp");
  return parsed;
}

function existingOutsideRepository(value, label) {
  const resolved = fs.realpathSync(value);
  const repository = fs.realpathSync(path.resolve(__dirname, "../.."));
  const relative = path.relative(repository, resolved);
  if (
    !relative ||
    (!relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  )
    throw new Error(label + " must be outside the repository");
  return resolved;
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function readCandidate(directory, name) {
  const match = ARCHIVE_PATTERN.exec(name);
  if (!match) return null;
  const archivePath = path.join(directory, name);
  const receiptPath = archivePath + ".verified.json";

  try {
    const archiveStat = fs.lstatSync(archivePath);
    const receiptStat = fs.lstatSync(receiptPath);
    if (
      !archiveStat.isFile() ||
      archiveStat.isSymbolicLink() ||
      !receiptStat.isFile() ||
      receiptStat.isSymbolicLink() ||
      receiptStat.size > RECEIPT_MAX_BYTES
    )
      return null;

    const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
    if (
      receipt.result !== "PASS" ||
      !["render", "neon"].includes(receipt.source) ||
      receipt.database !== "triad_staging" ||
      receipt.postgresMajor !== 18 ||
      receipt.disposableRestore !== true ||
      !Number.isSafeInteger(receipt.archiveBytes) ||
      receipt.archiveBytes <= 0 ||
      !/^[a-f0-9]{64}$/.test(receipt.sha256 || "") ||
      typeof receipt.sourceBackupAt !== "string" ||
      typeof receipt.verifiedAt !== "string"
    )
      return null;

    const sourceBackupAt = Date.parse(receipt.sourceBackupAt);
    const verifiedAt = Date.parse(receipt.verifiedAt);
    const fileTimestamp = archiveTimestamp(match[1]);
    if (
      !Number.isFinite(sourceBackupAt) ||
      !Number.isFinite(verifiedAt) ||
      sourceBackupAt > verifiedAt ||
      fileTimestamp > verifiedAt ||
      receipt.archiveBytes !== archiveStat.size
    )
      return null;

    const day = localDateKey(sourceBackupAt);
    if (localDateKey(fileTimestamp) !== day) return null;

    const sha256 = await hashFile(archivePath);
    if (sha256 !== receipt.sha256) return null;

    return {
      archivePath,
      receiptPath,
      name,
      source: receipt.source,
      day,
      sourceBackupAt,
      verifiedAt,
      sha256,
      archiveBytes: archiveStat.size,
      receipt,
    };
  } catch {
    return null;
  }
}

function compareNewestFirst(a, b) {
  return (
    b.sourceBackupAt - a.sourceBackupAt ||
    b.verifiedAt - a.verifiedAt ||
    b.name.localeCompare(a.name)
  );
}

function buildRetentionPlan(candidates) {
  const grouped = new Map();
  for (const candidate of candidates) {
    const key = candidate.source + "\0" + candidate.day;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(candidate);
  }

  return [...grouped.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort(compareNewestFirst);
      return {
        key,
        source: sorted[0].source,
        day: sorted[0].day,
        keeper: sorted[0],
        older: sorted.slice(1),
      };
    })
    .filter((group) => group.older.length > 0)
    .sort((a, b) => a.day.localeCompare(b.day) || a.source.localeCompare(b.source));
}

function sameCandidate(a, b) {
  return Boolean(
    a &&
      b &&
      a.archivePath === b.archivePath &&
      a.source === b.source &&
      a.day === b.day &&
      a.sourceBackupAt === b.sourceBackupAt &&
      a.sha256 === b.sha256 &&
      a.archiveBytes === b.archiveBytes &&
      a.verifiedAt === b.verifiedAt,
  );
}

async function inspectRetention(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() && ARCHIVE_PATTERN.test(entry.name))
    .map((entry) => entry.name);
  const candidates = [];
  const protectedFiles = [];

  for (const name of names) {
    const candidate = await readCandidate(directory, name);
    if (candidate) candidates.push(candidate);
    else protectedFiles.push(name);
  }

  return {
    candidates,
    protectedFiles,
    groups: buildRetentionPlan(candidates),
  };
}

async function runRetention({
  directory,
  keyFile,
  dryRun = true,
  verifyArchive = async ({ archivePath, keyFile: recoveryKey }) =>
    verifyBackup(
      "verify",
      {
        ...process.env,
        PORTFOLIO_BACKUP_ARCHIVE: archivePath,
        PORTFOLIO_BACKUP_KEY_FILE: recoveryKey,
      },
      { writeReceipt: false },
    ),
}) {
  if (typeof dryRun !== "boolean") throw new Error("Retention mode must be explicit");
  const backupDirectory = existingOutsideRepository(directory, "Backup directory");
  const recoveryKey = existingOutsideRepository(keyFile, "Recovery key");
  const keyStat = fs.lstatSync(recoveryKey);
  if (!keyStat.isFile() || keyStat.isSymbolicLink()) {
    throw new Error("Recovery key must be a regular file");
  }
  if (!/^[a-f0-9]{64}$/.test(fs.readFileSync(recoveryKey, "utf8").trim())) {
    throw new Error("Invalid recovery key");
  }

  const lockPath = path.join(backupDirectory, ".triad-retention.lock");
  const lockFd = fs.openSync(lockPath, "wx", 0o600);
  fs.closeSync(lockFd);
  const planned = [];
  const deleted = [];
  const failures = [];
  let protectedFiles = [];
  let groupsReviewed = 0;

  try {
    const inspection = await inspectRetention(backupDirectory);
    protectedFiles = inspection.protectedFiles;
    groupsReviewed = inspection.groups.length;

    for (const group of inspection.groups) {
      try {
        const verification = await verifyArchive({
          archivePath: group.keeper.archivePath,
          keyFile: recoveryKey,
          candidate: group.keeper,
        });
        const evidence = verification && verification.evidence
          ? verification.evidence
          : verification;
        if (
          !evidence ||
          evidence.result !== "PASS" ||
          evidence.source !== group.source ||
          evidence.sha256 !== group.keeper.sha256 ||
          evidence.archiveBytes !== group.keeper.archiveBytes ||
          evidence.disposableRestore !== true ||
          evidence.postgresMajor !== 18 ||
          evidence.sourceBackupAt !== group.keeper.receipt.sourceBackupAt ||
          !Number.isFinite(Date.parse(evidence.verifiedAt)) ||
          Date.parse(evidence.verifiedAt) < group.keeper.sourceBackupAt ||
          localDateKey(evidence.sourceBackupAt) !== group.day
        )
          throw new Error("Newest same-day archive failed retention evidence checks");

        const currentKeeper = await readCandidate(
          backupDirectory,
          group.keeper.name,
        );
        if (!sameCandidate(currentKeeper, group.keeper)) {
          throw new Error("Newest archive changed during retention verification");
        }

        for (const older of group.older) {
          const keeperStillValid = await readCandidate(
            backupDirectory,
            group.keeper.name,
          );
          if (!sameCandidate(keeperStillValid, group.keeper)) {
            throw new Error("Newest archive changed before same-day cleanup");
          }
          const current = await readCandidate(backupDirectory, older.name);
          if (!sameCandidate(current, older)) continue;

          const item = {
            source: group.source,
            day: group.day,
            archive: older.name,
            receipt: path.basename(older.receiptPath),
            keptArchive: group.keeper.name,
          };

          if (dryRun) {
            planned.push(item);
            continue;
          }

          // Remove the receipt first: interruption can leave an archive behind,
          // but can never leave a PASS receipt for an archive already removed.
          fs.unlinkSync(current.receiptPath);
          try {
            fs.unlinkSync(current.archivePath);
            deleted.push(item);
          } catch (error) {
            failures.push({
              archive: current.name,
              reason: "Receipt removed but archive deletion failed: " + error.message,
            });
          }
        }
      } catch (error) {
        failures.push({
          archive: group.keeper.name,
          reason: error && error.message ? error.message : String(error),
        });
      }
    }
  } finally {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // A stale lock is safer than an unguarded second retention process.
    }
  }

  return {
    dryRun,
    groupsReviewed,
    planned,
    deleted,
    failures,
    protectedFiles,
  };
}

async function main() {
  const argument = process.argv[2] || "--dry-run";
  if (!["--dry-run", "--apply"].includes(argument) || process.argv.length > 3) {
    throw new Error("Use --dry-run (default) or --apply");
  }
  const result = await runRetention({
    directory: process.env.PORTFOLIO_BACKUP_DIRECTORY,
    keyFile: process.env.PORTFOLIO_BACKUP_KEY_FILE,
    dryRun: argument !== "--apply",
  });
  console.log(
    "Retention " +
      (result.dryRun ? "DRY RUN" : "APPLY") +
      ": " +
      result.groupsReviewed +
      " source/day groups reviewed.",
  );
  for (const item of result.planned) {
    console.log(
      "WOULD DELETE " + item.archive + " (keeping " + item.keptArchive + ")",
    );
  }
  for (const item of result.deleted) {
    console.log("DELETED " + item.archive + " and its receipt.");
  }
  for (const item of result.failures) {
    console.error("PRESERVED " + item.archive + ": " + item.reason);
  }
  console.log("Protected unverified/unknown archives: " + result.protectedFiles.length);
  if (result.failures.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Retention FAILED: " + error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  localDateKey,
  buildRetentionPlan,
  inspectRetention,
  runRetention,
};
