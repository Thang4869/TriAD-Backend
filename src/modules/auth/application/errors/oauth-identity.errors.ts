export class OAuthIdentityUntrustedError extends Error {
  constructor() {
    super("OAuth identity email verification is required");
    this.name = "OAuthIdentityUntrustedError";
  }
}
