import prisma from "@core/database/prisma";
import { User, RefreshToken } from "@prisma/client";

export interface CreateUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export type RefreshTokenWithUser = RefreshToken & { user: User };

// ---------- Repository contract ----------

export interface IAuthRepository {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  createUser(data: CreateUserData): Promise<User>;
  createCartForUser(userId: string): Promise<void>;
  updateUser(id: string, data: Partial<User>): Promise<User>;

  createRefreshToken(
    token: string,
    userId: string,
    familyId: string,
    expiresAt: Date,
  ): Promise<RefreshToken>;
  findRefreshTokenByToken(token: string): Promise<RefreshToken | null>;
  revokeRefreshToken(id: string): Promise<void>;
  findRefreshTokenWithUser(token: string): Promise<RefreshTokenWithUser | null>;
  deleteRefreshTokenById(id: string): Promise<void>;
  deleteRefreshTokenByToken(token: string): Promise<void>;
  deleteRefreshTokensByUserId(userId: string): Promise<void>;
  findRefreshTokenByFamilyAndToken(
    familyId: string,
    token: string,
  ): Promise<RefreshToken | null>;
  findActiveRefreshTokenByFamily(
    familyId: string,
  ): Promise<RefreshToken | null>;
  revokeRefreshToken(id: string): Promise<void>;
  revokeAllTokensInFamily(familyId: string): Promise<void>;
}

// ---------- Prisma implementation ----------

export class PrismaAuthRepository implements IAuthRepository {
  async findUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async findUserById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async createUser(data: CreateUserData): Promise<User> {
    return prisma.user.create({
      data: { ...data, isVerified: false },
    });
  }

  async createCartForUser(userId: string): Promise<void> {
    await prisma.cart.create({ data: { userId } });
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    return prisma.user.update({ where: { id }, data });
  }

  async findRefreshTokenWithUser(
    token: string,
  ): Promise<RefreshTokenWithUser | null> {
    return prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  async deleteRefreshTokenById(id: string): Promise<void> {
    await prisma.refreshToken.delete({ where: { id } });
  }

  async deleteRefreshTokenByToken(token: string): Promise<void> {
    await prisma.refreshToken.deleteMany({ where: { token } });
  }

  async deleteRefreshTokensByUserId(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({ where: { userId } });
  }

  async findRefreshTokenByFamily(
    familyId: string,
    userId: string,
  ): Promise<RefreshToken | null> {
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
  ): Promise<RefreshToken> {
    return prisma.refreshToken.create({
      data: { token, userId, familyId, expiresAt },
    });
  }

  async findRefreshTokenByToken(token: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.findUnique({ where: { token } });
  }

  async findRefreshTokenByFamilyAndToken(
    familyId: string,
    token: string,
  ): Promise<RefreshToken | null> {
    return prisma.refreshToken.findUnique({
      where: { familyId_token: { familyId, token } },
    });
  }

  async findActiveRefreshTokenByFamily(
    familyId: string,
  ): Promise<RefreshToken | null> {
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
