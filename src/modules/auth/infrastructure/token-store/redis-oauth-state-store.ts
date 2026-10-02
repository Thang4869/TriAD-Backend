import crypto from "crypto";
import type { OAuthStateStorePort } from "../../application/ports/oauth-state-store.port";
import type { OAuthProvider } from "../../application/ports/oauth-identity";
import type { TokenStorePort } from "../../application/ports/token-store.port";

const STATE_TTL_SECONDS = 10 * 60;
const STATE_KEY_PREFIX = "oauth:state:";

export class RedisOAuthStateStore implements OAuthStateStorePort {
  constructor(private readonly tokenStore: TokenStorePort) {}

  async issue(provider: OAuthProvider): Promise<string> {
    const state = crypto.randomBytes(32).toString("base64url");
    await this.tokenStore.set(
      `${STATE_KEY_PREFIX}${state}`,
      provider,
      STATE_TTL_SECONDS,
    );
    return state;
  }

  async consume(provider: OAuthProvider, state: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return false;
    const storedProvider = await this.tokenStore.getAndDelete(
      `${STATE_KEY_PREFIX}${state}`,
    );
    return storedProvider === provider;
  }
}
