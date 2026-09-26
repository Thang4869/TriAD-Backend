import crypto from "crypto";
import { TokenStorePort } from "../application/ports/token-store.port";
import { SECURITY } from "@shared/constants/security.constant";
import { signToken, verifyToken, decodeToken } from "@shared/utils/jwt";
import { UnauthorizedError } from "@shared/utils/errors";
import { IAuthRepository } from "../auth.repository";
import { AuthUser } from "../application/ports/auth-user";
import { AuthUserResponse } from "../auth.mapper";
import config from "@config";
import {
  AccessTokenClaims,
  AccessTokenVerifierPort,
} from "../application/ports/access-token-verifier.port";

export interface PreAuthClaims {
  sub: string;
  purpose: "2fa";
  jti: string;
}

export class TokenService implements AccessTokenVerifierPort {
  verifyAccessToken(token: string): AccessTokenClaims {
    try {
      return verifyToken<AccessTokenClaims>(token, TokenService.ACCESS_SECRET);
    } catch {
      throw new UnauthorizedError("Invalid token");
    }
  }

  async isAccessTokenRevoked(token: string): Promise<boolean> {
    const value = await this.tokenStore.get(
      `${SECURITY.BLACKLIST_KEY_PREFIX}${token}`,
    );

    return value !== null;
  }
  constructor(
    private readonly authRepository: IAuthRepository,
    private readonly tokenStore: TokenStorePort,
  ) {}

  async issueTwoFactorPreAuthToken(userId: string): Promise<string> {
    const jti = crypto.randomUUID();

    const token = signToken(
      { sub: userId, purpose: "2fa", jti },
      config.JWT_PREAUTH_SECRET,
      "5m",
    );

    await this.tokenStore.set(`auth:2fa:preauth:${jti}`, userId, 300);

    return token;
  }

  async consumeTwoFactorPreAuthToken(token: string): Promise<string> {
    let claims: PreAuthClaims;

    try {
      claims = verifyToken<PreAuthClaims>(token, config.JWT_PREAUTH_SECRET);
    } catch {
      throw new UnauthorizedError(
        "Invalid or expired pre-authentication token",
      );
    }

    if (claims.purpose !== "2fa" || !claims.sub || !claims.jti) {
      throw new UnauthorizedError("Invalid pre-authentication token");
    }

    const key = `auth:2fa:preauth:${claims.jti}`;

    const consumed = await this.tokenStore.getAndDelete(key);

    if (consumed !== claims.sub) {
      throw new UnauthorizedError("Pre-authentication token already used");
    }

    return claims.sub;
  }

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
    const accessToken = signToken(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      TokenService.ACCESS_SECRET,
      TokenService.ACCESS_EXPIRY,
    );

    const finalFamilyId = familyId || crypto.randomUUID();

    const refreshToken = signToken(
      {
        sub: user.id,
        familyId: finalFamilyId,
      },
      TokenService.REFRESH_SECRET,
      TokenService.REFRESH_EXPIRY,
    );

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
      const { sub, familyId } = verifyToken<{
        sub: string;
        familyId: string;
      }>(refreshToken, TokenService.REFRESH_SECRET);

      const tokenRecord =
        await this.authRepository.findRefreshTokenWithUser(refreshToken);

      if (!tokenRecord) {
        throw new UnauthorizedError("Invalid refresh token");
      }

      if (tokenRecord.revokedAt !== null) {
        await this.authRepository.revokeAllTokensInFamily(tokenRecord.familyId);

        throw new UnauthorizedError("Token revoked - possible theft detected");
      }

      if (tokenRecord.expiresAt < new Date()) {
        throw new UnauthorizedError("Refresh token expired");
      }

      if (tokenRecord.familyId !== familyId) {
        throw new UnauthorizedError("Family ID mismatch");
      }

      if (tokenRecord.userId !== sub) {
        throw new UnauthorizedError("User ID mismatch");
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

          throw new UnauthorizedError(
            "Token has been superseded - possible theft",
          );
        }
      }

      await this.authRepository.revokeRefreshToken(tokenRecord.id);

      return this.generateTokens(tokenRecord.user, tokenRecord.familyId);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      throw new UnauthorizedError("Invalid refresh token");
    }
  }

  async invalidateAllUserTokens(userId: string): Promise<void> {
    await this.authRepository.deleteRefreshTokensByUserId(userId);
  }

  async blacklistAccessToken(accessToken: string): Promise<void> {
    try {
      const decoded = decodeToken(accessToken) as {
        exp: number;
      } | null;

      if (decoded?.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);

        if (ttl > 0) {
          await this.tokenStore.set(
            `${SECURITY.BLACKLIST_KEY_PREFIX}${accessToken}`,
            "1",
            ttl,
          );
        }
      }
    } catch {
      // swallow error, log warning handled outside
    }
  }
}
