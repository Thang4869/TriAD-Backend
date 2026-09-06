import { User } from "@prisma/client";
import { User as UserEntity } from "@modules/users/domain/user.entity";
import { Role } from "@shared/types/roles";

export interface AuthUserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  is2FAEnabled: boolean;
}

export function toAuthUserResponse(user: User): AuthUserResponse {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    is2FAEnabled: user.is2FAEnabled || false,
  };
}

export function toEntityData(
  user: User,
): Parameters<typeof UserEntity.hydrate>[0] {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    password: user.password,
    role: user.role as Role,
    isVerified: user.isVerified,
    is2FAEnabled: user.is2FAEnabled,
    totpSecret: user.totpSecret,
    phone: user.phone,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
