export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: string;
  jti: string;
  iss: string;
  aud: string;
  tokenType: "access";
  exp: number;
}

export interface AccessTokenVerifierPort {
  verifyAccessToken(token: string): AccessTokenClaims;
  isAccessTokenRevoked(token: string): Promise<boolean>;
}
