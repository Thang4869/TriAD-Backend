import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import bcrypt from "bcrypt";
import { User } from "@prisma/client";
import { AuthService } from "@modules/auth/auth.service";
import { IAuthRepository } from "@modules/auth/auth.repository";
import { BadRequestError, UnauthorizedError } from "@shared/utils/errors";
import { emailQueue } from "@core/queue/bull";
import redis from "@core/redis/client";
import speakeasy from "speakeasy";
import { signToken, decodeToken } from "@shared/utils/jwt";

const mockEmailService = {
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendOrderConfirmation: vi.fn().mockResolvedValue(undefined),
};

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

vi.mock("@core/logger/winston", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@shared/utils/jwt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/utils/jwt")>();
  return {
    ...actual,
    decodeToken: vi.fn(actual.decodeToken),
  };
});

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
      const service = new AuthService(repository, mockEmailService);

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
      const service = new AuthService(repository, mockEmailService);

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
      const service = new AuthService(repository, mockEmailService);

      await expect(
        service.login("notfound@test.com", "pass"),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("throws UnauthorizedError if password is incorrect", async () => {
      (bcrypt.compare as any).mockResolvedValueOnce(false);
      const repository = createFakeRepository({
        findUserByEmail: vi.fn().mockResolvedValue(baseUser),
      });
      const service = new AuthService(repository, mockEmailService);

      await expect(
        service.login("test@test.com", "wrong"),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("returns tokens when 2FA is not enabled", async () => {
      (bcrypt.compare as any).mockResolvedValueOnce(true);
      const repository = createFakeRepository({
        findUserByEmail: vi.fn().mockResolvedValue(baseUser),
      });
      const service = new AuthService(repository, mockEmailService);
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
      const service = new AuthService(repository, mockEmailService);

      const result = await service.login("test@test.com", "pass");
      expect(result).toEqual({
        requires2FA: true,
        userId: baseUser.id,
        message: "2FA required",
      });
    });

    it("uses empty string as password when user.password is null (OAuth user)", async () => {
      (bcrypt.compare as any).mockResolvedValueOnce(false);
      const oauthUser: User = { ...baseUser, password: null as any };
      const repository = createFakeRepository({
        findUserByEmail: vi.fn().mockResolvedValue(oauthUser),
      });
      const service = new AuthService(repository, mockEmailService);

      await expect(
        service.login("test@test.com", "anything"),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect(bcrypt.compare).toHaveBeenCalledWith("anything", "");
    });
  });

  describe("resendVerificationEmail", () => {
    it("does not send email if user not found", async () => {
      const repository = createFakeRepository({
        findUserByEmail: vi.fn().mockResolvedValue(null),
      });
      const service = new AuthService(repository, mockEmailService);
      const result = await service.resendVerificationEmail("notexist@test.com");
      expect(emailQueue.add).not.toHaveBeenCalled();
      expect(result.message).toContain("If that account exists");
    });

    it("does not send email if user already verified", async () => {
      const repository = createFakeRepository({
        findUserByEmail: vi
          .fn()
          .mockResolvedValue({ ...baseUser, isVerified: true }),
      });
      const service = new AuthService(repository, mockEmailService);
      await service.resendVerificationEmail("test@test.com");
      expect(emailQueue.add).not.toHaveBeenCalled();
    });

    it("sends email if user exists and not verified", async () => {
      const repository = createFakeRepository({
        findUserByEmail: vi
          .fn()
          .mockResolvedValue({ ...baseUser, isVerified: false }),
      });
      const service = new AuthService(repository, mockEmailService);
      await service.resendVerificationEmail("test@test.com");
      expect(emailQueue.add).toHaveBeenCalledWith(
        "verify-email",
        expect.objectContaining({ to: "test@test.com" }),
      );
    });
  });

  describe("logout", () => {
    it("deletes refresh token and blacklists access token", async () => {
      const repository = createFakeRepository();
      const service = new AuthService(repository, mockEmailService);
      const accessToken = "some.access.token";
      const refreshToken = "some.refresh.token";
      vi.spyOn(service as any, "blacklistAccessToken").mockResolvedValue(
        undefined,
      );
      await service.logout("user-1", accessToken, refreshToken);
      expect(repository.deleteRefreshTokenByToken).toHaveBeenCalledWith(
        refreshToken,
      );
      expect(service["blacklistAccessToken"]).toHaveBeenCalledWith(accessToken);
    });

    it("deletes all refresh tokens for user if no refreshToken provided", async () => {
      const repository = createFakeRepository();
      const service = new AuthService(repository, mockEmailService);
      await service.logout("user-1", "atoken");
      expect(repository.deleteRefreshTokensByUserId).toHaveBeenCalledWith(
        "user-1",
      );
    });

    it("does not attempt to blacklist anything when no accessToken is provided", async () => {
      const repository = createFakeRepository();
      const service = new AuthService(repository, mockEmailService);
      const spy = vi.spyOn(service as any, "blacklistAccessToken");

      await service.logout("user-1", undefined, "some.refresh.token");

      expect(spy).not.toHaveBeenCalled();
      expect(repository.deleteRefreshTokenByToken).toHaveBeenCalledWith(
        "some.refresh.token",
      );
    });
  });

  describe("enable2FA", () => {
    it("throws if user not found", async () => {
      const repository = createFakeRepository({
        findUserById: vi.fn().mockResolvedValue(null),
      });
      const service = new AuthService(repository, mockEmailService);
      await expect(service.enable2FA("user-x")).rejects.toThrow(
        BadRequestError,
      );
    });

    it("generates secret and updates user", async () => {
      const repository = createFakeRepository({
        findUserById: vi.fn().mockResolvedValue(baseUser),
      });
      const service = new AuthService(repository, mockEmailService);
      const result = await service.enable2FA("user-1");
      expect(repository.updateUser).toHaveBeenCalledWith("user-1", {
        totpSecret: expect.any(String),
        is2FAEnabled: false,
      });
      expect(result).toHaveProperty("otpauthUrl");
      expect(result).toHaveProperty("secret");
    });

    it("uses TOTP_ISSUER from env when provided instead of the default", async () => {
      const originalIssuer = process.env.TOTP_ISSUER;
      process.env.TOTP_ISSUER = "CustomIssuer";
      try {
        const repository = createFakeRepository({
          findUserById: vi.fn().mockResolvedValue(baseUser),
        });
        const service = new AuthService(repository, mockEmailService);
        const result = await service.enable2FA("user-1");
        expect(result.otpauthUrl).toContain("CustomIssuer");
      } finally {
        process.env.TOTP_ISSUER = originalIssuer;
      }
    });

    it("enable2FA uses default issuer 'TriAD' when TOTP_ISSUER is not set", async () => {
      const originalIssuer = process.env.TOTP_ISSUER;
      delete process.env.TOTP_ISSUER;
      try {
        const repository = createFakeRepository({
          findUserById: vi.fn().mockResolvedValue(baseUser),
        });
        const service = new AuthService(repository, mockEmailService);
        const result = await service.enable2FA("user-1");
        expect(result.otpauthUrl).toContain("TriAD");
        expect(result.secret).toBeDefined();
      } finally {
        process.env.TOTP_ISSUER = originalIssuer;
      }
    });

    it("handles case where otpauth_url is undefined (uses fallback empty string)", async () => {
      const repository = createFakeRepository({
        findUserById: vi.fn().mockResolvedValue(baseUser),
      });
      const service = new AuthService(repository, mockEmailService);

      const mockSecret = { base32: "mocked-base32", otpauth_url: undefined };
      vi.spyOn(speakeasy, "generateSecret").mockReturnValue(mockSecret as any);

      const result = await service.enable2FA("user-1");

      expect(result.otpauthUrl).toBe("");
      expect(result.secret).toBe("mocked-base32");
    });
  });

  describe("verify2FA", () => {
    it("throws if user not found or totpSecret missing", async () => {
      const repository = createFakeRepository({
        findUserById: vi.fn().mockResolvedValue(null),
      });
      const service = new AuthService(repository, mockEmailService);
      await expect(service.verify2FA("user-x", "123456")).rejects.toThrow(
        BadRequestError,
      );
    });

    it("throws if TOTP token invalid", async () => {
      const repository = createFakeRepository({
        findUserById: vi
          .fn()
          .mockResolvedValue({ ...baseUser, totpSecret: "secret" }),
      });
      const service = new AuthService(repository, mockEmailService);
      vi.spyOn(service as any, "verifyTotpToken").mockReturnValue(false);
      await expect(service.verify2FA("user-1", "wrong")).rejects.toThrow(
        BadRequestError,
      );
    });

    it("enables 2FA on valid token", async () => {
      const repository = createFakeRepository({
        findUserById: vi
          .fn()
          .mockResolvedValue({ ...baseUser, totpSecret: "secret" }),
      });
      const service = new AuthService(repository, mockEmailService);
      vi.spyOn(service as any, "verifyTotpToken").mockReturnValue(true);
      const result = await service.verify2FA("user-1", "123456");
      expect(repository.updateUser).toHaveBeenCalledWith("user-1", {
        is2FAEnabled: true,
      });
      expect(result).toEqual({ enabled: true });
    });
  });

  describe("verifyTotpToken (real speakeasy verification, not spied)", () => {
    it("accepts a currently-valid TOTP code and rejects a bogus one", async () => {
      const secret = speakeasy.generateSecret({ name: "TriAD:test" });
      const validToken = speakeasy.totp({
        secret: secret.base32,
        encoding: "base32",
      });

      const repository = createFakeRepository({
        findUserById: vi.fn().mockResolvedValue({
          ...baseUser,
          totpSecret: secret.base32,
          is2FAEnabled: true,
        }),
      });
      const service = new AuthService(repository, mockEmailService);

      const result = await service.verifyTOTP("user-1", validToken);
      expect(result).toHaveProperty("accessToken");

      await expect(service.verifyTOTP("user-1", "000000")).rejects.toThrow(
        BadRequestError,
      );
    });
  });

  describe("verifyTOTP", () => {
    it("throws if user not found or 2FA not enabled", async () => {
      const repository = createFakeRepository({
        findUserById: vi.fn().mockResolvedValue(null),
      });
      const service = new AuthService(repository, mockEmailService);
      await expect(service.verifyTOTP("user-x", "123456")).rejects.toThrow(
        BadRequestError,
      );
    });

    it("throws on invalid token", async () => {
      const repository = createFakeRepository({
        findUserById: vi.fn().mockResolvedValue({
          ...baseUser,
          totpSecret: "secret",
          is2FAEnabled: true,
        }),
      });
      const service = new AuthService(repository, mockEmailService);
      vi.spyOn(service as any, "verifyTotpToken").mockReturnValue(false);
      await expect(service.verifyTOTP("user-1", "wrong")).rejects.toThrow(
        BadRequestError,
      );
    });

    it("returns tokens on valid TOTP", async () => {
      const repository = createFakeRepository({
        findUserById: vi.fn().mockResolvedValue({
          ...baseUser,
          totpSecret: "secret",
          is2FAEnabled: true,
        }),
      });
      const service = new AuthService(repository, mockEmailService);
      vi.spyOn(service as any, "verifyTotpToken").mockReturnValue(true);
      vi.spyOn(service, "generateTokens").mockResolvedValue({
        accessToken: "at",
        refreshToken: "rt",
        user: {
          id: "user-1",
          email: "a@b.com",
          firstName: "A",
          lastName: "B",
          role: "USER",
          is2FAEnabled: true,
        },
      });
      const result = await service.verifyTOTP("user-1", "123456");
      expect(result.accessToken).toBeDefined();
    });
  });

  describe("refreshToken", () => {
    it("throws if token invalid or expired", async () => {
      const repository = createFakeRepository({
        findRefreshTokenWithUser: vi.fn().mockResolvedValue(null),
      });
      const service = new AuthService(repository, mockEmailService);
      await expect(service.refreshToken("bad")).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it("throws if the token record is expired, even with a validly-signed JWT", async () => {
      const expiredRefreshToken = signToken(
        { sub: baseUser.id },
        process.env.JWT_REFRESH_SECRET as string,
        "7d",
      );
      const record = {
        id: "rt1",
        expiresAt: new Date(Date.now() - 1000),
        user: baseUser,
      };
      const repository = createFakeRepository({
        findRefreshTokenWithUser: vi.fn().mockResolvedValue(record),
      });
      const service = new AuthService(repository, mockEmailService);
      await expect(service.refreshToken(expiredRefreshToken)).rejects.toThrow(
        UnauthorizedError,
      );
      expect(repository.deleteRefreshTokenById).not.toHaveBeenCalled();
    });

    it("rotates the refresh token and returns new tokens on success", async () => {
      const validRefreshToken = signToken(
        { sub: baseUser.id },
        process.env.JWT_REFRESH_SECRET as string,
        "7d",
      );
      const record = {
        id: "rt-valid",
        expiresAt: new Date(Date.now() + 60_000),
        user: baseUser,
      };
      const repository = createFakeRepository({
        findRefreshTokenWithUser: vi.fn().mockResolvedValue(record),
      });
      const service = new AuthService(repository, mockEmailService);

      const result = await service.refreshToken(validRefreshToken);

      expect(repository.deleteRefreshTokenById).toHaveBeenCalledWith(record.id);
      expect(repository.deleteRefreshTokensByUserId).toHaveBeenCalledWith(
        baseUser.id,
      );
      expect(repository.createRefreshToken).toHaveBeenCalled();
      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result.user).toMatchObject({ id: baseUser.id });
    });
  });

  describe("verifyEmail", () => {
    it("throws BadRequestError when the token is invalid or expired in Redis", async () => {
      (redis.get as any).mockResolvedValueOnce(null);
      const repository = createFakeRepository();
      const service = new AuthService(repository, mockEmailService);

      await expect(service.verifyEmail("bad-token")).rejects.toBeInstanceOf(
        BadRequestError,
      );
      expect(repository.findUserById).not.toHaveBeenCalled();
    });

    it("throws BadRequestError when the user no longer exists", async () => {
      (redis.get as any).mockResolvedValueOnce("user-id");
      const repository = createFakeRepository({
        findUserById: vi.fn().mockResolvedValue(null),
      });
      const service = new AuthService(repository, mockEmailService);

      await expect(service.verifyEmail("token")).rejects.toBeInstanceOf(
        BadRequestError,
      );
    });

    it("deletes the redis token and returns tokens directly if already verified", async () => {
      (redis.get as any).mockResolvedValueOnce("user-id");
      const repository = createFakeRepository({
        findUserById: vi
          .fn()
          .mockResolvedValue({ ...baseUser, isVerified: true }),
      });
      const service = new AuthService(repository, mockEmailService);

      const result = await service.verifyEmail("token");

      expect(redis.del).toHaveBeenCalledWith("email-verify:token");
      expect(repository.updateUser).not.toHaveBeenCalled();
      expect(result).toHaveProperty("accessToken");
    });

    it("marks the user as verified and returns tokens when not yet verified", async () => {
      (redis.get as any).mockResolvedValueOnce("user-id");
      const unverifiedUser = { ...baseUser, isVerified: false };
      const repository = createFakeRepository({
        findUserById: vi.fn().mockResolvedValue(unverifiedUser),
        updateUser: vi
          .fn()
          .mockResolvedValue({ ...unverifiedUser, isVerified: true }),
      });
      const service = new AuthService(repository, mockEmailService);

      const result = await service.verifyEmail("token");

      expect(repository.updateUser).toHaveBeenCalledWith(baseUser.id, {
        isVerified: true,
      });
      expect(result).toHaveProperty("accessToken");
    });

    it("returns tokens directly if user is already verified (real generateTokens)", async () => {
      (redis.get as any).mockResolvedValueOnce("user-id");
      const verifiedUser = { ...baseUser, isVerified: true };
      const repository = createFakeRepository({
        findUserById: vi.fn().mockResolvedValue(verifiedUser),
        createRefreshToken: vi.fn().mockResolvedValue({}),
      });
      const service = new AuthService(repository, mockEmailService);

      const result = await service.verifyEmail("token");

      expect(result.accessToken).toBeDefined();
      expect(repository.updateUser).not.toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith("email-verify:token");
    });
  });

  describe("login - unverified user", () => {
    it("throws UnauthorizedError if the user has not verified their email", async () => {
      (bcrypt.compare as any).mockResolvedValueOnce(true);
      const repository = createFakeRepository({
        findUserByEmail: vi
          .fn()
          .mockResolvedValue({ ...baseUser, isVerified: false }),
      });
      const service = new AuthService(repository, mockEmailService);

      await expect(service.login("test@test.com", "pass")).rejects.toThrow(
        UnauthorizedError,
      );
    });
  });

  describe("generateTokens", () => {
    it("signs access/refresh tokens, persists the refresh token, and maps the user", async () => {
      const repository = createFakeRepository();
      const service = new AuthService(repository, mockEmailService);

      const result = await service.generateTokens(baseUser);

      expect(typeof result.accessToken).toBe("string");
      expect(typeof result.refreshToken).toBe("string");
      expect(repository.createRefreshToken).toHaveBeenCalledWith(
        result.refreshToken,
        baseUser.id,
        expect.any(Date),
      );
      expect(result.user).toEqual({
        id: baseUser.id,
        email: baseUser.email,
        firstName: baseUser.firstName,
        lastName: baseUser.lastName,
        role: baseUser.role,
        is2FAEnabled: baseUser.is2FAEnabled,
      });
    });

    it("throws if JWT_ACCESS_SECRET is not configured", async () => {
      const previous = process.env.JWT_ACCESS_SECRET;
      delete process.env.JWT_ACCESS_SECRET;

      const repository = createFakeRepository();
      const service = new AuthService(repository, mockEmailService);

      await expect(service.generateTokens(baseUser)).rejects.toThrow(
        "JWT_ACCESS_SECRET is not defined",
      );

      process.env.JWT_ACCESS_SECRET = previous;
    });

    it("throws if JWT_REFRESH_SECRET is not configured", async () => {
      const previous = process.env.JWT_REFRESH_SECRET;
      delete process.env.JWT_REFRESH_SECRET;

      const repository = createFakeRepository();
      const service = new AuthService(repository, mockEmailService);

      await expect(service.generateTokens(baseUser)).rejects.toThrow(
        "JWT_REFRESH_SECRET is not defined",
      );

      process.env.JWT_REFRESH_SECRET = previous;
    });
  });

  describe("logout - blacklistAccessToken", () => {
    it("blacklists a valid access token with the remaining TTL until expiry", async () => {
      const accessToken = signToken(
        { sub: baseUser.id },
        process.env.JWT_ACCESS_SECRET as string,
        "15m",
      );
      const repository = createFakeRepository();
      const service = new AuthService(repository, mockEmailService);

      await service.logout(baseUser.id, accessToken);

      expect(redis.setex).toHaveBeenCalledWith(
        `jwt:blacklist:${accessToken}`,
        expect.any(Number),
        "1",
      );
      const ttlUsed = (redis.setex as any).mock.calls[0][1];
      expect(ttlUsed).toBeGreaterThan(0);
      expect(ttlUsed).toBeLessThanOrEqual(15 * 60);
    });

    it("does not blacklist a token that has no exp claim", async () => {
      const accessToken = "not-a-real-jwt-token";
      const repository = createFakeRepository();
      const service = new AuthService(repository, mockEmailService);

      await service.logout(baseUser.id, accessToken);

      expect(redis.setex).not.toHaveBeenCalled();
    });

    it("does not blacklist a token whose exp is already in the past", async () => {
      const accessToken = signToken(
        { sub: baseUser.id },
        process.env.JWT_ACCESS_SECRET as string,
        -10,
      );
      const repository = createFakeRepository();
      const service = new AuthService(repository, mockEmailService);

      await service.logout(baseUser.id, accessToken);

      expect(redis.setex).not.toHaveBeenCalled();
    });

    it("logs a warning and swallows the error if decoding the access token throws", async () => {
      const { logger } = await import("@core/logger/winston");
      (decodeToken as any).mockImplementationOnce(() => {
        throw new Error("malformed token");
      });

      const repository = createFakeRepository();
      const service = new AuthService(repository, mockEmailService);

      await expect(
        service.logout(baseUser.id, "any-token"),
      ).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith(
        "Failed to decode access token during logout",
        expect.objectContaining({ error: expect.any(Error) }),
      );
      expect(redis.setex).not.toHaveBeenCalled();
    });
  });

  describe("AuthService - JWT expiry config", () => {
    afterEach(() => {
      delete process.env.JWT_ACCESS_EXPIRY;
      delete process.env.JWT_REFRESH_EXPIRY;
    });

    it("falls back to default 15m/7d expiry when unset", async () => {
      delete process.env.JWT_ACCESS_EXPIRY;
      delete process.env.JWT_REFRESH_EXPIRY;

      const repository = createFakeRepository();
      const service = new AuthService(repository, mockEmailService);
      const result = await service.generateTokens(baseUser);

      expect(typeof result.accessToken).toBe("string");
      expect(typeof result.refreshToken).toBe("string");
    });

    it("uses JWT_ACCESS_EXPIRY/JWT_REFRESH_EXPIRY from env when explicitly provided", async () => {
      process.env.JWT_ACCESS_EXPIRY = "30m";
      process.env.JWT_REFRESH_EXPIRY = "30d";

      const repository = createFakeRepository();
      const service = new AuthService(repository, mockEmailService);
      const result = await service.generateTokens(baseUser);

      expect(typeof result.accessToken).toBe("string");
      expect(typeof result.refreshToken).toBe("string");
    });
  });
});
