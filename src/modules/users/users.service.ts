import bcrypt from "bcrypt";
import prisma from "@core/database/prisma";
import { BadRequestError, NotFoundError } from "@shared/utils/errors";

export class UsersService {
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
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
      },
    });
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return user;
  }

  async updateProfile(userId: string, data: { firstName?: string; lastName?: string; phone?: string }) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError("User not found");
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
      },
      select: {
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
      },
    });
    return updated;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError("User not found");
    }

    const isValid = await bcrypt.compare(currentPassword, user.password || "");
    if (!isValid) {
      throw new BadRequestError("Current password is incorrect");
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    return { success: true };
  }
}