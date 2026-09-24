import crypto from "crypto";

const VERSION = "v1";

function keyBytes(key: string): Buffer {
  const decoded = /^[0-9a-fA-F]{64}$/.test(key)
    ? Buffer.from(key, "hex")
    : Buffer.from(key, "base64");
  if (decoded.length !== 32)
    throw new Error("TOTP encryption key must be 32 bytes");
  return decoded;
}

export function encryptTotpSecret(secret: string, key: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBytes(key), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptTotpSecret(payload: string, key: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = payload.split(".");
  if (version !== VERSION || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Unsupported TOTP secret format");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    keyBytes(key),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
