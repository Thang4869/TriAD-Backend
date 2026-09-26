export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: string;
}

export interface AccessTokenVerifierPort {
  verifyAccessToken(token: string): AccessTokenClaims;
  isAccessTokenRevoked(token: string): Promise<boolean>;
}
