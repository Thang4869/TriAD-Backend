import { afterEach, describe, expect, it, vi } from "vitest";
import passport from "passport";
import { registerOAuthStrategies } from "@modules/auth/strategies/oauth2.strategy";
import type { AuthService } from "@modules/auth/auth.service";
import type { OAuthStateStorePort } from "@modules/auth/application/ports/oauth-state-store.port";

const originalEnv = { ...process.env };
afterEach(() => {
  for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALLBACK_URL", "FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "FACEBOOK_CALLBACK_URL"]) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  passport.unuse("google");
  passport.unuse("facebook");
});

function dependencies() {
  const auth = { resolveOAuthIdentity: vi.fn(), generateTokens: vi.fn() } as unknown as AuthService;
  const state = { consume: vi.fn().mockResolvedValue(true) } as unknown as OAuthStateStorePort;
  return { auth, state };
}

describe("registerOAuthStrategies", () => {
  it("does not register providers when credentials are incomplete", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    delete process.env.FACEBOOK_APP_ID;
    process.env.FACEBOOK_APP_SECRET = "secret";
    const { auth, state } = dependencies();
    registerOAuthStrategies(auth, state);
    expect(passport._strategy("google")).toBeFalsy();
    expect(passport._strategy("facebook")).toBeFalsy();
  });

  it("registers Google and Facebook only when each credential pair is present", () => {
    process.env.GOOGLE_CLIENT_ID = "google-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-secret";
    process.env.FACEBOOK_APP_ID = "facebook-id";
    process.env.FACEBOOK_APP_SECRET = "facebook-secret";
    const { auth, state } = dependencies();
    registerOAuthStrategies(auth, state);
    expect(passport._strategy("google")).toBeTruthy();
    expect(passport._strategy("facebook")).toBeTruthy();
  });
});
