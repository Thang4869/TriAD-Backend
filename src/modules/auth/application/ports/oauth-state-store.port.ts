import type { OAuthProvider } from "./oauth-identity";

export interface OAuthStateStorePort {
  issue(provider: OAuthProvider): Promise<string>;
  consume(provider: OAuthProvider, state: string): Promise<boolean>;
}
