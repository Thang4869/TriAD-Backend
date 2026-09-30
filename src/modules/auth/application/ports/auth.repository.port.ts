import type { AuthUser } from "./auth-user";
import type {
  AuthRefreshToken,
  AuthRefreshTokenWithUser,
} from "./auth-refresh-token";

export interface CreateUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface CreateOAuthUserData {
  email: string;
  firstName: string;
  lastName: string;
}

export interface IAuthRepository {
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserById(id: string): Promise<AuthUser | null>;

  createUser(data: CreateUserData): Promise<AuthUser>;
  createOAuthUser(data: CreateOAuthUserData): Promise<AuthUser>;
  createCartForUser(userId: string): Promise<void>;

  updateUser(id: string, data: Partial<AuthUser>): Promise<AuthUser>;

  createRefreshToken(
    token: string,
    userId: string,
    familyId: string,
    expiresAt: Date,
  ): Promise<AuthRefreshToken>;

  findRefreshTokenByToken(token: string): Promise<AuthRefreshToken | null>;

  revokeRefreshToken(id: string): Promise<boolean>;

  rotateRefreshToken(
    currentTokenId: string,
    token: string,
    userId: string,
    familyId: string,
    expiresAt: Date,
  ): Promise<boolean>;

  findRefreshTokenWithUser(
    token: string,
  ): Promise<AuthRefreshTokenWithUser | null>;

  deleteRefreshTokenById(id: string): Promise<void>;
  deleteRefreshTokenByToken(token: string): Promise<void>;
  deleteRefreshTokensByUserId(userId: string): Promise<void>;

  findRefreshTokenByFamilyAndToken(
    familyId: string,
    token: string,
  ): Promise<AuthRefreshToken | null>;

  findActiveRefreshTokenByFamily(
    familyId: string,
  ): Promise<AuthRefreshToken | null>;

  revokeAllTokensInFamily(familyId: string): Promise<void>;
}
