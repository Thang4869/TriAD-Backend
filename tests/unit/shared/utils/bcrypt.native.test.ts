import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";
import { comparePassword, hashPassword } from "@shared/utils/bcrypt";

/**
 * This suite deliberately uses the native bcrypt binding, not a vi.mock,
 * so the bcrypt 5 -> 6 binary/tooling upgrade cannot silently break login.
 */
describe("bcrypt native compatibility (B10)", () => {
  it("generates a valid bcrypt hash that is accepted by the login helper", async () => {
    const hashed = await hashPassword("test-password-with-unicode-ắ");
    expect(hashed).toMatch(/^\$2[aby]\$\d\d\$/);
    await expect(comparePassword("test-password-with-unicode-ắ", hashed)).resolves.toBe(true);
    await expect(comparePassword("not-the-password", hashed)).resolves.toBe(false);
  });

  it("verifies existing $2a$ formatted bcrypt hashes for ASCII credentials", async () => {
    const currentHash = await bcrypt.hash("legacy-ascii-password", 4);
    const legacyHash = currentHash.replace(/^\$2b\$/, "$2a$");
    expect(legacyHash).toMatch(/^\$2a\$/);
    await expect(comparePassword("legacy-ascii-password", legacyHash)).resolves.toBe(true);
    await expect(comparePassword("wrong-password", legacyHash)).resolves.toBe(false);
  });
});
