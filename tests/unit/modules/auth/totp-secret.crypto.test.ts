import { describe, expect, it } from "vitest";
import {
  decryptTotpSecret,
  encryptTotpSecret,
} from "@modules/auth/services/totp-secret.crypto";

describe("TOTP secret encryption", () => {
  const secret = "JBSWY3DPEHPK3PXP";
  const hexKey = "0123456789abcdef".repeat(4);
  const base64Key = Buffer.alloc(32, 7).toString("base64");

  it("round-trips a secret with a hexadecimal AES key", () => {
    const payload = encryptTotpSecret(secret, hexKey);

    expect(payload.split(".")).toHaveLength(4);
    expect(decryptTotpSecret(payload, hexKey)).toBe(secret);
  });

  it("round-trips a secret with a base64 AES key", () => {
    const payload = encryptTotpSecret(secret, base64Key);

    expect(decryptTotpSecret(payload, base64Key)).toBe(secret);
  });

  it("rejects encryption keys that do not decode to 32 bytes", () => {
    expect(() => encryptTotpSecret(secret, "short-key")).toThrow(
      "TOTP encryption key must be 32 bytes",
    );
  });

  it.each(["", "v2.iv.tag.ciphertext", "v1.iv.tag", "v1..tag.ciphertext"])(
    "rejects unsupported or incomplete payload %s",
    (payload) => {
      expect(() => decryptTotpSecret(payload, hexKey)).toThrow(
        "Unsupported TOTP secret format",
      );
    },
  );

  it("rejects payloads whose authentication tag has been modified", () => {
    const payload = encryptTotpSecret(secret, hexKey);
    const [version, iv, tag, ciphertext] = payload.split(".");
    const changedTag = tag.startsWith("A")
      ? `B${tag.slice(1)}`
      : `A${tag.slice(1)}`;

    expect(() =>
      decryptTotpSecret(
        [version, iv, changedTag, ciphertext].join("."),
        hexKey,
      ),
    ).toThrow();
  });

  it("rejects a valid payload when decrypted with a different key", () => {
    const payload = encryptTotpSecret(secret, hexKey);

    expect(() => decryptTotpSecret(payload, base64Key)).toThrow();
  });
});
