import { describe, expect, it } from "vitest";
import {
  generateCsrfToken,
  isCsrfTokenForSession,
  readCsrfSessionId,
} from "@shared/utils/csrf-token";
import { authSessionFixture } from "../../../helpers/auth-session";

describe("session-bound CSRF tokens", () => {
  it("uses a random nonce and a domain-separated HMAC over the session", () => {
    const token = generateCsrfToken("session-1");
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(isCsrfTokenForSession(token, "session-1")).toBe(true);
    expect(isCsrfTokenForSession(token, "session-2")).toBe(false);
    expect(generateCsrfToken("session-1")).not.toBe(token);
  });

  it("rejects changes to either the nonce or the signature", () => {
    const token = generateCsrfToken("session-1");
    for (const index of [0, 32, 63]) {
      const modified =
        token.slice(0, index) +
        (token[index] === "a" ? "b" : "a") +
        token.slice(index + 1);
      expect(isCsrfTokenForSession(modified, "session-1")).toBe(false);
    }
  });

  it.each([
    "",
    "a".repeat(63),
    "a".repeat(65),
    "g".repeat(64),
    "A".repeat(64),
    "a".repeat(10000),
  ])("rejects malformed encodings without throwing", (token) => {
    expect(isCsrfTokenForSession(token, "session-1")).toBe(false);
  });

  it("reads the shared family binding without treating decoding as authentication", () => {
    const credentials = authSessionFixture("session-1");
    expect(readCsrfSessionId(credentials.accessToken, "access")).toBe(
      "session-1",
    );
    expect(readCsrfSessionId(credentials.refreshToken, "refresh")).toBe(
      "session-1",
    );
    expect(readCsrfSessionId(credentials.refreshToken, "access")).toBeNull();
    expect(readCsrfSessionId(credentials.accessToken, "refresh")).toBeNull();
  });

  it.each([
    null,
    {},
    [],
    123,
    "",
    "not-a-jwt",
    "eyJhbGciOiJIUzI1NiJ9.invalid.invalid",
  ])(
    "rejects malformed or legacy credentials without a binding",
    (credential) => {
      expect(readCsrfSessionId(credential, "access")).toBeNull();
    },
  );
});
