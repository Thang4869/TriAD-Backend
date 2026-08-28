import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcrypt";
import { User } from "@prisma/client";
import { AuthService } from "@modules/auth/auth.service";
import { IAuthRepository } from "@modules/auth/auth.repository";
import { BadRequestError, UnauthorizedError } from "@shared/utils/errors";

vi.mock("@core/redis/client", () => ({
  default: {
    get: vi.fn(),
    setex: vi.fn().mockResolvedValue("OK"),
    del: vi.fn(),
  },
}));

vi.mock("@core/queue/bull", () => ({
  emailQueue: { add: vi.fn().mockResolvedValue({}) },
}));

vi.mock("bcrypt", () => ({
  default: { hash: vi.fn(), compare: vi.fn() },
}));

import { emailQueue } from "@core/queue/bull";

function createFakeRepository(
  overrides: Partial<IAuthRepository> = {},
): IAuthRepository {
  return {
    findUserByEmail: vi.fn().mockResolvedValue(null),
    findUserById: vi.fn().mockResolvedValue(null),
    createUser: vi.fn(),
    createCartForUser: vi.fn().mockResolvedValue(undefined),
    updateUser: vi.fn(),
    createRefreshToken: vi.fn().mockResolvedValue({}),
    findRefreshTokenWithUser: vi.fn().mockResolvedValue(null),
    deleteRefreshTokenById: vi.fn().mockResolvedValue(undefined),
    deleteRefreshTokenByToken: vi.fn().mockResolvedValue(undefined),
    deleteRefreshTokensByUserId: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const baseUser: User = {
  id: "user-id",
  email: "test@test.com",
  password: "hashed",
  firstName: "John",
  lastName: "Doe",
  phone: null,
  role: "USER",
  isVerified: true,
  is2FAEnabled: false,
  totpSecret: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as User;

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = "test-access-secret-32charslongenough";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret-32charslongenough";
  });

  describe("register", () => {
    it("throws BadRequestError if email already exists", async () => {
      const repository = createFakeRepository({
        findUserByEmail: vi.fn().mockResolvedValue({ id: "existing" }),
      });
      const service = new AuthService(repository);

      await expect(
        service.register({
          email: "test@test.com",
          password: "123456",
          firstName: "John",
          lastName: "Doe",
        }),
      ).rejects.toBeInstanceOf(BadRequestError);

      expect(repository.createUser).not.toHaveBeenCalled();
    });

    it("creates user, cart, and enqueues verification email", async () => {
      (bcrypt.hash as any).mockResolvedValueOnce("hashed");

      const repository = createFakeRepository({
        findUserByEmail: vi.fn().mockResolvedValue(null),
        createUser: vi.fn().mockResolvedValue(baseUser),
      });
      const service = new AuthService(repository);

      const result = await service.register({
        email: "test@test.com",
        password: "123456",
        firstName: "John",
        lastName: "Doe",
      });

      expect(result.user).toMatchObject({ email: "test@test.com" });
      expect(result.message).toContain("check your email");
      expect(repository.createCartForUser).toHaveBeenCalledWith(baseUser.id);
      expect(emailQueue.add).toHaveBeenCalledWith(
        "verify-email",
        expect.objectContaining({ to: "test@test.com" }),
      );
    });
  });

  describe("login", () => {
    it("throws UnauthorizedError if user not found", async () => {
      const repository = createFakeRepository({
        findUserByEmail: vi.fn().mockResolvedValue(null),
      });
      const service = new AuthService(repository);

      await expect(
        service.login("notfound@test.com", "pass"),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("throws UnauthorizedError if password is incorrect", async () => {
      (bcrypt.compare as any).mockResolvedValueOnce(false);
      const repository = createFakeRepository({
        findUserByEmail: vi.fn().mockResolvedValue(baseUser),
      });
      const service = new AuthService(repository);

      await expect(
        service.login("test@test.com", "wrong"),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("returns tokens when 2FA is not enabled", async () => {
      (bcrypt.compare as any).mockResolvedValueOnce(true);
      const repository = createFakeRepository({
        findUserByEmail: vi.fn().mockResolvedValue(baseUser),
      });
      const service = new AuthService(repository);
      vi.spyOn(service, "generateTokens").mockResolvedValueOnce({
        accessToken: "at",
        refreshToken: "rt",
        user: {
          id: baseUser.id,
          email: baseUser.email,
          firstName: baseUser.firstName,
          lastName: baseUser.lastName,
          role: baseUser.role,
          is2FAEnabled: baseUser.is2FAEnabled,
        },
      });

      const result = await service.login("test@test.com", "pass");
      expect(result).toHaveProperty("accessToken");
    });

    it("returns requires2FA when 2FA is enabled", async () => {
      (bcrypt.compare as any).mockResolvedValueOnce(true);
      const twoFactorUser: User = { ...baseUser, is2FAEnabled: true };
      const repository = createFakeRepository({
        findUserByEmail: vi.fn().mockResolvedValue(twoFactorUser),
      });
      const service = new AuthService(repository);

      const result = await service.login("test@test.com", "pass");
      expect(result).toEqual({
        requires2FA: true,
        userId: baseUser.id,
        message: "2FA required",
      });
    });
  });
});