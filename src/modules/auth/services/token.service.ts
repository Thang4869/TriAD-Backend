import crypto from "crypto";
import redis from "@core/redis/client";
import { SECURITY } from "@shared/constants/security.constant";
import { signToken, verifyToken, decodeToken } from "@shared/utils/jwt";
import { UnauthorizedError } from "@shared/utils/errors";
import { IAuthRepository } from "../auth.repository";
import { User } from "@prisma/client";
import { AuthUserResponse } from "../auth.mapper";

export class TokenService {
  constructor(private readonly authRepository: IAuthRepository) {}

  private static get ACCESS_SECRET(): string {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error("JWT_ACCESS_SECRET is not defined");
    return secret;
  }

  private static get REFRESH_SECRET(): string {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) throw new Error("JWT_REFRESH_SECRET is not defined");
    return secret;
  }

  private static get ACCESS_EXPIRY(): string {
    return process.env.JWT_ACCESS_EXPIRY || "15m";
  }

  private static get REFRESH_EXPIRY(): string {
    return process.env.JWT_REFRESH_EXPIRY || "7d";
  }

  async generateTokens(
    user: User,
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
      { sub: user.id, email: user.email, role: user.role },
      TokenService.ACCESS_SECRET,
      TokenService.ACCESS_EXPIRY,
    );

    const refreshToken = signToken(
      { sub: user.id, familyId: familyId || crypto.randomUUID() },
      TokenService.REFRESH_SECRET,
      TokenService.REFRESH_EXPIRY,
    );

    const decoded = verifyToken<{ familyId: string }>(
      refreshToken,
      TokenService.REFRESH_SECRET,
    );
    const finalFamilyId = decoded.familyId;

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
      const { sub, familyId } = verifyToken<{ sub: string; familyId: string }>(
        refreshToken,
        TokenService.REFRESH_SECRET,
      );

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
      if (error instanceof UnauthorizedError) throw error;
      throw new UnauthorizedError("Invalid refresh token");
    }
  }

  async invalidateAllUserTokens(userId: string): Promise<void> {
    await this.authRepository.deleteRefreshTokensByUserId(userId);
  }

  async blacklistAccessToken(accessToken: string): Promise<void> {
    try {
      const decoded = decodeToken(accessToken) as { exp: number } | null;
      if (decoded?.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await redis.setex(
            `${SECURITY.BLACKLIST_KEY_PREFIX}${accessToken}`,
            ttl,
            "1",
          );
        }
      }
    } catch {
      // swallow error, log warning handled outside
    }
  }
}
