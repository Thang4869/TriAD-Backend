"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");
const MAGIC = Buffer.from("TRIADBK1");

// Authenticated local format shared by CI and the portfolio backup.
// Key custody/rotation and off-host retention belong to the calling workflow.
async function archive(mode, input, output, keyFile) {
  if (!["encrypt", "decrypt"].includes(mode))
    throw new Error("Invalid archive mode");
  const keyText = fs.readFileSync(keyFile, "utf8").trim();
  if (!/^[a-f0-9]{64}$/.test(keyText))
    throw new Error("A separate 32-byte key is required");
  const key = Buffer.from(keyText, "hex");
  const temporary = path.join(
    path.dirname(output),
    ".recovery-" + crypto.randomUUID(),
  );
  try {
    let transform, source;
    if (mode === "encrypt") {
      const iv = crypto.randomBytes(12);
      const destination = fs.createWriteStream(temporary, {
        flags: "wx",
        mode: 0o600,
      });
      destination.write(Buffer.concat([MAGIC, iv]));
      transform = crypto.createCipheriv("aes-256-gcm", key, iv);
      source = fs.createReadStream(input);
      await pipeline(source, transform, destination);
      fs.appendFileSync(temporary, transform.getAuthTag());
    } else {
      const size = fs.statSync(input).size;
      if (size < 36) throw new Error("Invalid encrypted archive");
      const fd = fs.openSync(input, "r");
      const header = Buffer.alloc(20),
        tag = Buffer.alloc(16);
      try {
        fs.readSync(fd, header, 0, 20, 0);
        fs.readSync(fd, tag, 0, 16, size - 16);
      } finally {
        fs.closeSync(fd);
      }
      if (!header.subarray(0, 8).equals(MAGIC))
        throw new Error("Invalid archive format");
      transform = crypto.createDecipheriv(
        "aes-256-gcm",
        key,
        header.subarray(8),
      );
      transform.setAuthTag(tag);
      const destination = fs.createWriteStream(temporary, {
        flags: "wx",
        mode: 0o600,
      });
      const ciphertext =
        size === 36
          ? Readable.from([])
          : fs.createReadStream(input, { start: 20, end: size - 17 });
      await pipeline(ciphertext, transform, destination);
    }
    // Publish only authenticated, complete output and never overwrite a file.
    fs.linkSync(temporary, output);
  } finally {
    key.fill(0);
    try {
      fs.unlinkSync(temporary);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
if (require.main === module) {
  archive(...process.argv.slice(2)).catch(() => {
    console.error("Recovery archive operation failed; no output published");
    process.exitCode = 1;
  });
}
module.exports = { archive };
