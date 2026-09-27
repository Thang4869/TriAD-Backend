import crypto from "crypto";
import prisma from "@core/database/prisma";
import {
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

  async revokeRefreshToken(id: string): Promise<void> {
    await prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllTokensInFamily(familyId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { familyId },
      data: { revokedAt: new Date() },
    });
  }
}
