import { Role } from "@shared/types/roles";

export interface AuthSessionUser {
  id: string;
  email: string;
  role: Role;
  isVerified: boolean;
}

export interface AuthSessionUserPort {
  findById(id: string): Promise<AuthSessionUser | null>;
}
