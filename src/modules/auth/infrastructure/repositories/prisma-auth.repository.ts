import crypto from "crypto";
import prisma from "@core/database/prisma";
import {
  Prisma,
  User as PrismaUser,
  RefreshToken as PrismaRefreshToken,
} from "@prisma/client";

import type {
  CreateOAuthUserData,
  CreateUserData,
  IAuthRepository,
} from "../../application/ports/auth.repository.port";
import type {
  AuthSessionUser,
  AuthSessionUserPort,
} from "../../application/ports/auth-session-user.port";
import type { AuthUser } from "../../application/ports/auth-user";
import type {
  OAuthIdentity,
  OAuthResolution,
} from "../../application/ports/oauth-identity";
import { OAuthIdentityUntrustedError } from "../../application/errors/oauth-identity.errors";

function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ---------- Prisma implementation ----------

export class PrismaAuthRepository
  implements IAuthRepository, AuthSessionUserPort
{
  async findUserByEmail(email: string): Promise<PrismaUser | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async findById(id: string): Promise<AuthSessionUser | null> {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        isVerified: true,
      },
    });
  }

  async createUser(data: CreateUserData): Promise<PrismaUser> {
    return prisma.user.create({
      data: { ...data, isVerified: false },
    });
  }

  async createOAuthUser(data: CreateOAuthUserData): Promise<PrismaUser> {
    return prisma.user.create({
      data: {
        ...data,
        isVerified: true,
        cart: {
          create: {},
        },
      },
    });
  }

  async resolveOAuthIdentity(data: OAuthIdentity): Promise<OAuthResolution> {
    try {
      const user = await prisma.$transaction(async (tx) => {
        const linked = await tx.oAuthAccount.findUnique({
          where: {
            provider_providerSubject: {
              provider: data.provider,
              providerSubject: data.subject,
            },
          },
          include: { user: true },
        });
        if (linked) return { user: linked.user, created: false };

        const existing = await tx.user.findUnique({
          where: { email: data.email },
        });
        if (existing) {
          if (!data.emailVerified) throw new OAuthIdentityUntrustedError();
          await tx.oAuthAccount.create({
            data: {
              userId: existing.id,
              provider: data.provider,
              providerSubject: data.subject,
              providerEmail: data.email,
              providerEmailVerified: true,
            },
          });
          return { user: existing, created: false };
        }

        const created = await tx.user.create({
          data: {
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            isVerified: data.emailVerified,
            cart: { create: {} },
            oauthAccounts: {
              create: {
                provider: data.provider,
                providerSubject: data.subject,
                providerEmail: data.email,
                providerEmailVerified: data.emailVerified,
              },
            },
          },
        });
        return { user: created, created: true };
      });
      return user;
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      ) {
        throw error;
      }

      const linked = await prisma.oAuthAccount.findUnique({
        where: {
          provider_providerSubject: {
            provider: data.provider,
            providerSubject: data.subject,
          },
        },
        include: { user: true },
      });
      if (linked) return { user: linked.user, created: false };

      const existing = await prisma.user.findUnique({
        where: { email: data.email },
      });
      if (existing && data.emailVerified) {
        try {
          await prisma.oAuthAccount.create({
            data: {
              userId: existing.id,
              provider: data.provider,
              providerSubject: data.subject,
              providerEmail: data.email,
              providerEmailVerified: true,
            },
          });
          return { user: existing, created: false };
        } catch (retryError) {
          if (
            retryError instanceof Prisma.PrismaClientKnownRequestError &&
            retryError.code === "P2002"
          ) {
            const raced = await prisma.oAuthAccount.findUnique({
              where: {
                provider_providerSubject: {
                  provider: data.provider,
                  providerSubject: data.subject,
                },
              },
              include: { user: true },
            });
            if (raced) return { user: raced.user, created: false };
          }
          throw retryError;
        }
      }

      throw error;
    }
  }

  async createCartForUser(userId: string): Promise<void> {
    await prisma.cart.create({ data: { userId } });
  }

  async updateUser(id: string, data: Partial<PrismaUser>): Promise<PrismaUser> {
    return prisma.user.update({ where: { id }, data });
  }

  async findRefreshTokenWithUser(
    token: string,
  ): Promise<(PrismaRefreshToken & { user: PrismaUser }) | null> {
    return prisma.refreshToken.findUnique({
      where: { token: hashRefreshToken(token) },
      include: { user: true },
    });
  }

  async deleteRefreshTokenById(id: string): Promise<void> {
    await prisma.refreshToken.delete({ where: { id } });
  }

  async deleteRefreshTokenByToken(token: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { token: hashRefreshToken(token) },
    });
  }

  async deleteRefreshTokensByUserId(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({ where: { userId } });
  }

  async findRefreshTokenByFamily(
    familyId: string,
    userId: string,
  ): Promise<PrismaRefreshToken | null> {
    return prisma.refreshToken.findFirst({
      where: { familyId, userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createRefreshToken(
    token: string,
    userId: string,
    familyId: string,
    expiresAt: Date,
  ): Promise<PrismaRefreshToken> {
    return prisma.refreshToken.create({
      data: { token: hashRefreshToken(token), userId, familyId, expiresAt },
    });
  }

  async findRefreshTokenByToken(
    token: string,
  ): Promise<PrismaRefreshToken | null> {
    return prisma.refreshToken.findUnique({
      where: { token: hashRefreshToken(token) },
    });
  }

  async findRefreshTokenByFamilyAndToken(
    familyId: string,
    token: string,
  ): Promise<PrismaRefreshToken | null> {
    return prisma.refreshToken.findUnique({
      where: { familyId_token: { familyId, token: hashRefreshToken(token) } },
    });
  }

  async findActiveRefreshTokenByFamily(
    familyId: string,
  ): Promise<PrismaRefreshToken | null> {
    return prisma.refreshToken.findFirst({
      where: {
        familyId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async revokeRefreshToken(id: string): Promise<boolean> {
    const result = await prisma.refreshToken.updateMany({
      where: {
        id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return result.count === 1;
  }

  async rotateRefreshToken(
    currentTokenId: string,
    token: string,
    userId: string,
    familyId: string,
    expiresAt: Date,
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: {
          id: currentTokenId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      if (revoked.count !== 1) {
        return false;
      }

      await tx.refreshToken.create({
        data: {
          token: hashRefreshToken(token),
          userId,
          familyId,
          expiresAt,
        },
      });

      return true;
    });
  }

  async revokeAllTokensInFamily(familyId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { familyId },
      data: { revokedAt: new Date() },
    });
  }
}
