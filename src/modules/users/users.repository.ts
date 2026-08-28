import prisma from "@core/database/prisma";
import { User } from "@prisma/client";

const PROFILE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isVerified: true,
  is2FAEnabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type UserProfile = Pick<User, keyof typeof PROFILE_SELECT>;

export interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

// ---------- Repository contract ----------

export interface IUsersRepository {
  findProfileById(userId: string): Promise<UserProfile | null>;
  findById(userId: string): Promise<User | null>;
  updateProfile(userId: string, data: UpdateProfileData): Promise<UserProfile>;
  updatePassword(userId: string, hashedPassword: string): Promise<void>;
}

// ---------- Prisma implementation ----------

export class PrismaUsersRepository implements IUsersRepository {
  async findProfileById(userId: string): Promise<UserProfile | null> {
    return prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
  }

  async findById(userId: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id: userId } });
  }

  async updateProfile(userId: string, data: UpdateProfileData): Promise<UserProfile> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
      },
      select: PROFILE_SELECT,
    });
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }
}