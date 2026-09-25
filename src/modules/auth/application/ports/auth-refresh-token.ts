import { AuthUser } from "./auth-user";

export interface AuthRefreshToken {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface AuthRefreshTokenWithUser extends AuthRefreshToken {
  user: AuthUser;
}
