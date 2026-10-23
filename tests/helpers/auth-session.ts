import { sign } from "jsonwebtoken";

// Controller/CSRF fixtures only: authentication is stubbed in those HTTP tests.
// Never use these keys or credentials against a hosted application.
export function authSessionFixture(sessionId: string) {
  return {
    accessToken: sign(
      { tokenType: "access", sessionId },
      "disposable-csrf-fixture-key",
    ),
    refreshToken: sign(
      { tokenType: "refresh", familyId: sessionId },
      "disposable-csrf-fixture-key",
    ),
  };
}
