const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { archive } = require("../../scripts/acceptance/recovery-archive.cjs");

for (const size of [0, 100_000])
  test(`restores ${size} bytes and rejects tamper/wrong keys without publishing plaintext`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "triad-archive-test-"));
    const p = (name) => path.join(dir, name);
    try {
      fs.writeFileSync(p("key"), crypto.randomBytes(32).toString("hex"), {
        mode: 0o600,
      });
      fs.writeFileSync(p("wrong-key"), crypto.randomBytes(32).toString("hex"), {
        mode: 0o600,
      });
      fs.writeFileSync(p("input"), crypto.randomBytes(size));
      await archive("encrypt", p("input"), p("encrypted"), p("key"));
      await archive("decrypt", p("encrypted"), p("restored"), p("key"));
      assert.deepEqual(
        fs.readFileSync(p("restored")),
        fs.readFileSync(p("input")),
      );
      await assert.rejects(
        archive("decrypt", p("encrypted"), p("bad"), p("wrong-key")),
      );
      assert.equal(fs.existsSync(p("bad")), false);
      const data = fs.readFileSync(p("encrypted"));
      data[25] ^= 1;
      fs.writeFileSync(p("tampered"), data);
      await assert.rejects(
        archive("decrypt", p("tampered"), p("bad"), p("key")),
      );
      assert.equal(fs.existsSync(p("bad")), false);
      await assert.rejects(
        archive("decrypt", p("encrypted"), p("restored"), p("key")),
      );
      fs.writeFileSync(p("truncated"), Buffer.from("invalid"));
      await assert.rejects(
        archive("decrypt", p("truncated"), p("bad"), p("key")),
      );
      assert.equal(
        fs.readdirSync(dir).filter((name) => name.startsWith(".recovery-"))
          .length,
        0,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
