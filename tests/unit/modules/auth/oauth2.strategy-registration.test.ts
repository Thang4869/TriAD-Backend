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
  vi.restoreAllMocks();
});

function dependencies() {
  const auth = { resolveOAuthIdentity: vi.fn(), generateTokens: vi.fn() } as unknown as AuthService;
  const state = { consume: vi.fn().mockResolvedValue(true) } as unknown as OAuthStateStorePort;
  return { auth, state };
}

function getRegisteredStrategy(name: string) {
  return (
    passport as unknown as {
      _strategy: (strategyName: string) => {
        _stateStore: {
          store: (...args: unknown[]) => void;
          verify: (...args: unknown[]) => Promise<void>;
        };
      };
    }
  )._strategy(name);
}

describe("registerOAuthStrategies", () => {
  it("does not register providers when credentials are incomplete", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    delete process.env.FACEBOOK_APP_ID;
    process.env.FACEBOOK_APP_SECRET = "secret";
    const { auth, state } = dependencies();
    const useSpy = vi.spyOn(passport, "use");
    registerOAuthStrategies(auth, state);
    expect(useSpy).not.toHaveBeenCalled();
  });

  it("delegates OAuth state verification to the state store", async () => {
    process.env.GOOGLE_CLIENT_ID = "google-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-secret";
    const { auth, state } = dependencies();
    registerOAuthStrategies(auth, state);

    const strategy = getRegisteredStrategy("google");
    const storeCallback = vi.fn();
    strategy._stateStore.store({}, storeCallback);
    expect(storeCallback).toHaveBeenCalledWith(null);

    const validCallback = vi.fn();
    await strategy._stateStore.verify({}, "valid-state", {}, validCallback);
    expect(state.consume).toHaveBeenCalledWith("GOOGLE", "valid-state");
    expect(validCallback).toHaveBeenCalledWith(null, true, undefined);
  });

  it("rejects invalid OAuth state and forwards state-store errors", async () => {
    process.env.GOOGLE_CLIENT_ID = "google-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-secret";
    const { auth, state } = dependencies();
    registerOAuthStrategies(auth, state);
    const strategy = getRegisteredStrategy("google");

    vi.mocked(state.consume).mockResolvedValueOnce(false);
    const invalidCallback = vi.fn();
    await strategy._stateStore.verify({}, "invalid-state", {}, invalidCallback);
    expect(invalidCallback).toHaveBeenCalledWith(null, false, "oauth_state_invalid");

    const failure = new Error("state store unavailable");
    vi.mocked(state.consume).mockRejectedValueOnce(failure);
    const errorCallback = vi.fn();
    await strategy._stateStore.verify({}, "state", {}, errorCallback);
    expect(errorCallback).toHaveBeenCalledWith(failure, false);
  });

  it("registers Google and Facebook only when each credential pair is present", () => {
    process.env.GOOGLE_CLIENT_ID = "google-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-secret";
    process.env.FACEBOOK_APP_ID = "facebook-id";
    process.env.FACEBOOK_APP_SECRET = "facebook-secret";
    const { auth, state } = dependencies();
    const useSpy = vi.spyOn(passport, "use");
    registerOAuthStrategies(auth, state);
    expect(useSpy).toHaveBeenCalledTimes(2);
  });
});
