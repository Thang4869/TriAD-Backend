import { User } from "@prisma/client";

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