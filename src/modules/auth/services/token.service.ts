import crypto from "crypto";
import { TokenStorePort } from "../application/ports/token-store.port";
import { SECURITY } from "@shared/constants/security.constant";
import { signToken, verifyToken } from "@shared/utils/jwt";
import {
  AuthenticationError,
  DependencyUnavailableError,
} from "@shared/errors/application-error";
import type { IAuthRepository } from "../application/ports/auth.repository.port";
import { AuthUser } from "../application/ports/auth-user";
import { AuthUserResponse } from "../auth.mapper";
import config from "@config";
import { logger } from "@core/logger/winston";
import { authTokenStoreFailuresTotal } from "@core/metrics/metrics.registry";
import {
  AccessTokenClaims,
  AccessTokenVerifierPort,
} from "../application/ports/access-token-verifier.port";

type TokenType = "access" | "refresh" | "preauth";

interface TokenBaseClaims {
  sub: string;
  jti: string;
  iss: string;
  aud: string;
  tokenType: TokenType;
  exp: number;
}

export interface PreAuthClaims extends TokenBaseClaims {
  tokenType: "preauth";
  purpose: "2fa";
}

interface RefreshTokenClaims extends TokenBaseClaims {
  tokenType: "refresh";
  familyId: string;
}

/** JWT signatures and issuer/audience are verified before the claims are read. */
function hasBaseClaims(
  value: unknown,
  tokenType: TokenType,
  audience: string,
): value is TokenBaseClaims & Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const claims = value as Record<string, unknown>;
  return (
    typeof claims.sub === "string" &&
    claims.sub.length > 0 &&
    typeof claims.jti === "string" &&
    claims.jti.length > 0 &&
    claims.iss === config.JWT_ISSUER &&
    claims.aud === audience &&
    claims.tokenType === tokenType &&
    typeof claims.exp === "number" &&
    Number.isFinite(claims.exp)
  );
}

/** Validate access-specific fields before narrowing untrusted JWT payloads. */
function hasAccessClaims(value: unknown): value is AccessTokenClaims {
  return (
    hasBaseClaims(value, "access", config.JWT_ACCESS_AUDIENCE) &&
    typeof value.email === "string" &&
    typeof value.role === "string"
  );
}

function hasRefreshClaims(value: unknown): value is RefreshTokenClaims {
  return (
    hasBaseClaims(value, "refresh", config.JWT_REFRESH_AUDIENCE) &&
    typeof value.familyId === "string" &&
    value.familyId.length > 0
  );
}

function hasPreAuthClaims(value: unknown): value is PreAuthClaims {
  return (
    hasBaseClaims(value, "preauth", config.JWT_PREAUTH_AUDIENCE) &&
    value.purpose === "2fa"
  );
}

export class TokenService implements AccessTokenVerifierPort {
  constructor(
    private readonly authRepository: IAuthRepository,
    private readonly tokenStore: TokenStorePort,
  ) {}

  private static get ACCESS_SECRET(): string {
    return config.JWT_ACCESS_SECRET;
  }

  private static get REFRESH_SECRET(): string {
    return config.JWT_REFRESH_SECRET;
  }

  private static get ACCESS_EXPIRY(): string {
    return config.JWT_ACCESS_EXPIRY;
  }

  private static get REFRESH_EXPIRY(): string {
    return config.JWT_REFRESH_EXPIRY;
  }

  private static claims(tokenType: TokenType, aud: string) {
    return {
      tokenType,
      jti: crypto.randomUUID(),
      iss: config.JWT_ISSUER,
      aud,
    };
  }

  private signAccessToken(user: Pick<AuthUser, "id" | "email" | "role">) {
    return signToken(
      {
        ...TokenService.claims("access", config.JWT_ACCESS_AUDIENCE),
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      TokenService.ACCESS_SECRET,
      TokenService.ACCESS_EXPIRY,
    );
  }

  private signRefreshToken(userId: string, familyId: string) {
    return signToken(
      {
        ...TokenService.claims("refresh", config.JWT_REFRESH_AUDIENCE),
        sub: userId,
        familyId,
      },
      TokenService.REFRESH_SECRET,
      TokenService.REFRESH_EXPIRY,
    );
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    try {
      const claims = verifyToken<unknown>(token, TokenService.ACCESS_SECRET, {
        issuer: config.JWT_ISSUER,
        audience: config.JWT_ACCESS_AUDIENCE,
      });

      if (!hasAccessClaims(claims)) {
        throw new AuthenticationError("Invalid access token claims");
      }

      return claims;
    } catch {
      throw new AuthenticationError("Invalid token");
    }
  }

  private verifyRefreshToken(token: string): RefreshTokenClaims {
    const claims = verifyToken<unknown>(token, TokenService.REFRESH_SECRET, {
      issuer: config.JWT_ISSUER,
      audience: config.JWT_REFRESH_AUDIENCE,
    });

    if (!hasRefreshClaims(claims)) {
      throw new AuthenticationError("Invalid refresh token claims");
    }

    return claims;
  }

  private static revocationKey(jti: string): string {
    // Only a non-reversible digest of the token ID reaches Redis key space.
    return `${SECURITY.BLACKLIST_KEY_PREFIX}${crypto.createHash("sha256").update(jti).digest("hex")}`;
  }

  private tokenStoreUnavailable(operation: "read" | "write", error: unknown) {
    authTokenStoreFailuresTotal.inc({ operation });
    logger.error("Auth revocation Redis unavailable (fail-closed)", {
      operation,
      policy: "fail-closed",
      error: error instanceof Error ? error.message : "unknown",
    });
    return new DependencyUnavailableError(
      "Authentication temporarily unavailable",
    );
  }

  async isAccessTokenRevoked(token: string): Promise<boolean> {
    const claims = this.verifyAccessToken(token);
    try {
      const value = await this.tokenStore.get(
        TokenService.revocationKey(claims.jti),
      );
      return value !== null;
    } catch (error) {
      throw this.tokenStoreUnavailable("read", error);
    }
  }

  async issueTwoFactorPreAuthToken(userId: string): Promise<string> {
    const claims = TokenService.claims("preauth", config.JWT_PREAUTH_AUDIENCE);
    const token = signToken(
      { ...claims, sub: userId, purpose: "2fa" },
      config.JWT_PREAUTH_SECRET,
      "5m",
    );
    try {
      await this.tokenStore.set(`auth:2fa:preauth:${claims.jti}`, userId, 300);
    } catch (error) {
      throw this.tokenStoreUnavailable("write", error);
    }
    return token;
  }

  async consumeTwoFactorPreAuthToken(token: string): Promise<string> {
    let claims: PreAuthClaims;

    try {
      const decoded = verifyToken<unknown>(token, config.JWT_PREAUTH_SECRET, {
        issuer: config.JWT_ISSUER,
        audience: config.JWT_PREAUTH_AUDIENCE,
      });

      if (!hasPreAuthClaims(decoded)) {
        throw new AuthenticationError("Invalid pre-authentication token");
      }

      claims = decoded;
    } catch {
      throw new AuthenticationError(
        "Invalid or expired pre-authentication token",
      );
    }

    let consumed: string | null;
    try {
      consumed = await this.tokenStore.getAndDelete(
        `auth:2fa:preauth:${claims.jti}`,
      );
    } catch (error) {
      throw this.tokenStoreUnavailable("read", error);
    }

    if (consumed !== claims.sub) {
      throw new AuthenticationError("Pre-authentication token already used");
    }

    return claims.sub;
  }

  async generateTokens(
    user: AuthUser,
    familyId?: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      is2FAEnabled: boolean;
    };
  }> {
    const accessToken = this.signAccessToken(user);
    const finalFamilyId = familyId || crypto.randomUUID();
    const refreshToken = this.signRefreshToken(user.id, finalFamilyId);
    await this.authRepository.createRefreshToken(
      refreshToken,
      user.id,
      finalFamilyId,
      new Date(Date.now() + SECURITY.REFRESH_TOKEN_TTL_MS),
    );
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        is2FAEnabled: user.is2FAEnabled || false,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthUserResponse;
  }> {
    try {
      const { sub, familyId } = this.verifyRefreshToken(refreshToken);
      const tokenRecord =
        await this.authRepository.findRefreshTokenWithUser(refreshToken);
      if (!tokenRecord) {
        throw new AuthenticationError("Invalid refresh token");
      }
      if (tokenRecord.revokedAt !== null) {
        await this.authRepository.revokeAllTokensInFamily(tokenRecord.familyId);
        throw new AuthenticationError(
          "Token revoked - possible theft detected",
        );
      }
      if (tokenRecord.expiresAt < new Date()) {
        throw new AuthenticationError("Refresh token expired");
      }
      if (tokenRecord.familyId !== familyId) {
        throw new AuthenticationError("Family ID mismatch");
      }
      if (tokenRecord.userId !== sub) {
        throw new AuthenticationError("User ID mismatch");
      }
      const latestToken =
        await this.authRepository.findActiveRefreshTokenByFamily(
          tokenRecord.familyId,
        );
      const REFRESH_GRACE_PERIOD_SECONDS = 30;
      if (latestToken && latestToken.id !== tokenRecord.id) {
        const timeDiff =
          (Date.now() - new Date(latestToken.createdAt).getTime()) / 1000;
        if (timeDiff >= REFRESH_GRACE_PERIOD_SECONDS) {
          await this.authRepository.revokeAllTokensInFamily(
            tokenRecord.familyId,
          );
          throw new AuthenticationError(
            "Token has been superseded - possible theft",
          );
        }
      }
      const accessToken = this.signAccessToken(tokenRecord.user);
      const newRefreshToken = this.signRefreshToken(
        tokenRecord.user.id,
        tokenRecord.familyId,
      );
      const rotated = await this.authRepository.rotateRefreshToken(
        tokenRecord.id,
        newRefreshToken,
        tokenRecord.user.id,
        tokenRecord.familyId,
        new Date(Date.now() + SECURITY.REFRESH_TOKEN_TTL_MS),
      );
      if (!rotated) {
        throw new AuthenticationError("Refresh token already used");
      }
      return {
        accessToken,
        refreshToken: newRefreshToken,
        user: {
          id: tokenRecord.user.id,
          email: tokenRecord.user.email,
          firstName: tokenRecord.user.firstName,
          lastName: tokenRecord.user.lastName,
          role: tokenRecord.user.role,
          is2FAEnabled: tokenRecord.user.is2FAEnabled || false,
        },
      };
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError("Invalid refresh token");
    }
  }

  async invalidateAllUserTokens(userId: string): Promise<void> {
    await this.authRepository.deleteRefreshTokensByUserId(userId);
  }

  async blacklistAccessToken(accessToken: string): Promise<void> {
    const claims = this.verifyAccessToken(accessToken);
    const ttl = claims.exp - Math.floor(Date.now() / 1000);
    if (ttl <= 0) return;
    try {
      await this.tokenStore.set(
        TokenService.revocationKey(claims.jti),
        "1",
        ttl,
      );
    } catch (error) {
      throw this.tokenStoreUnavailable("write", error);
    }
  }
}
