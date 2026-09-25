import { Role } from "@shared/types/roles";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string | null;
  role: Role;
  isVerified: boolean;
  is2FAEnabled: boolean;
  totpSecret: string | null;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}
