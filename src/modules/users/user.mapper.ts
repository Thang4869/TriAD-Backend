import { User as PrismaUser } from "@prisma/client";
import { User } from "./domain/user.entity";
import { Role } from "@shared/types/roles";

export class UserMapper {
  static toDomain(prismaUser: PrismaUser): User {
    return User.hydrate({
      id: prismaUser.id,
      email: prismaUser.email,
      firstName: prismaUser.firstName,
      lastName: prismaUser.lastName,
      password: prismaUser.password,
      role: prismaUser.role as Role,
      isVerified: prismaUser.isVerified,
      is2FAEnabled: prismaUser.is2FAEnabled || false,
      totpSecret: prismaUser.totpSecret || null,
      phone: prismaUser.phone || null,
      createdAt: prismaUser.createdAt,
      updatedAt: prismaUser.updatedAt,
    });
  }
}
