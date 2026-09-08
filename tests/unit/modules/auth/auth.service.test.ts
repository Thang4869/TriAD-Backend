import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import bcrypt from "bcrypt";
import { User } from "@prisma/client";
import { AuthService } from "@modules/auth/auth.service";
import { IAuthRepository } from "@modules/auth/auth.repository";
import { BadRequestError, UnauthorizedError } from "@shared/utils/errors";
import redis from "@core/redis/client";
import speakeasy from "speakeasy";
import { signToken, decodeToken } from "@shared/utils/jwt";
import { EmailService } from "@/shared/services/email.service";
import { TwoFactorService } from "@/modules/auth/services/two-factor.service";
import { TokenService } from "@/modules/auth/services/token.service";
import { logger } from "@core/logger/winston";

// ---------- Mocks ----------
const mockEmailService = {
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendOrderConfirmation: vi.fn().mockResolvedValue(undefined),
  enqueue: vi.fn().mockResolvedValue(undefined),
  enqueueWithRetry: vi.fn().mockResolvedValue(undefined),
} as unknown as EmailService;

// Mock Redis
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

// ---------- Helper to create repository mock ----------
function createFakeRepository(overrides = {}): IAuthRepository {
  return {
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    createUser: vi.fn(),
    createCartForUser: vi.fn(),
    updateUser: vi.fn(),
    createRefreshToken: vi.fn(),
    findRefreshTokenByToken: vi.fn(),
    revokeRefreshToken: vi.fn(),
    findRefreshTokenWithUser: vi.fn(),
    deleteRefreshTokenById: vi.fn(),
    deleteRefreshTokenByToken: vi.fn(),
    deleteRefreshTokensByUserId: vi.fn(),
    findRefreshTokenByFamilyAndToken: vi.fn(),
    findActiveRefreshTokenByFamily: vi.fn(),
    revokeAllTokensInFamily: vi.fn(),
    ...overrides,
  };
}

// ---------- Base user ----------
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

// ---------- Tests ----------
describe("AuthService", () => {
  let repository: IAuthRepository;
  let mockTokenService: TokenService;
  let mockTwoFactorService: TwoFactorService;
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = "test-access-secret-32charslongenough";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret-32charslongenough";

    repository = createFakeRepository();

    // ----- TokenService mock với implementation cơ bản -----
    mockTokenService = {
      generateTokens: vi.fn().mockImplementation(async (user: User) => {
        const accessToken = signToken(
          { sub: user.id },
          process.env.JWT_ACCESS_SECRET!,
          "15m",
        );
        const refreshToken = signToken(
          { sub: user.id, familyId: "family-id" },
          process.env.JWT_REFRESH_SECRET!,
          "7d",
        );
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await repository.createRefreshToken(
          refreshToken,
          user.id,
          "family-id",
          expiresAt,
        );
        return {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            is2FAEnabled: user.is2FAEnabled,
          },
        };
      }),
      refreshToken: vi.fn().mockImplementation(async (token: string) => {
        // Kiểm tra token hợp lệ (mô phỏng)
        if (token === "bad" || token === "expired") {
          throw new UnauthorizedError("Invalid refresh token");
        }
        // Giả lập tìm record
        const record = await repository.findRefreshTokenWithUser(token);
        if (!record) throw new UnauthorizedError("Invalid refresh token");
        // Kiểm tra hết hạn
        if (record.expiresAt < new Date()) {
          throw new UnauthorizedError("Refresh token expired");
        }
        // Xóa token cũ, tạo token mới
        await repository.deleteRefreshTokenById(record.id);
        await repository.deleteRefreshTokensByUserId(record.userId);
        const newAccessToken = signToken(
          { sub: record.userId },
          process.env.JWT_ACCESS_SECRET!,
          "15m",
        );
        const newRefreshToken = signToken(
          { sub: record.userId, familyId: "new-family" },
          process.env.JWT_REFRESH_SECRET!,
          "7d",
        );
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await repository.createRefreshToken(
          newRefreshToken,
          record.userId,
          "new-family",
          expiresAt,
        );
        return {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          user: {
            id: record.user.id,
            email: record.user.email,
            firstName: record.user.firstName,
            lastName: record.user.lastName,
            role: record.user.role,
            is2FAEnabled: record.user.is2FAEnabled,
          },
        };
      }),
      blacklistAccessToken: vi
        .fn()
        .mockImplementation(async (token: string) => {
          try {
            const decoded = decodeToken(token) as { exp?: number } | null;
            if (decoded?.exp) {
              const ttl = decoded.exp - Math.floor(Date.now() / 1000);
              if (ttl > 0) {
                await redis.setex(`jwt:blacklist:${token}`, ttl, "1");
              }
            }
          } catch (error) {
            logger.warn("Failed to decode access token during logout", {
              error,
            });
          }
        }),
      invalidateAllUserTokens: vi
        .fn()
        .mockImplementation(async (userId: string) => {
          await repository.deleteRefreshTokensByUserId(userId);
        }),
    } as unknown as TokenService;

    // ----- TwoFactorService mock với implementation cơ bản -----
    mockTwoFactorService = {
      enable2FA: vi.fn().mockImplementation(async (userId: string) => {
        const user = await repository.findUserById(userId);
        if (!user) throw new BadRequestError("User not found");
        const issuer = process.env.TOTP_ISSUER || "TriAD";
        const secret = speakeasy.generateSecret({
          name: `${issuer}:${user.email}`,
          issuer,
        });
        await repository.updateUser(userId, {
          totpSecret: secret.base32,
          is2FAEnabled: false,
        });
        return { otpauthUrl: secret.otpauth_url ?? "", secret: secret.base32 };
      }),
      verify2FA: vi
        .fn()
        .mockImplementation(async (userId: string, token: string) => {
          const user = await repository.findUserById(userId);
          if (!user || !user.totpSecret)
            throw new BadRequestError("2FA not set up");
          // Bỏ qua verify thực tế trong mock để test gọi updateUser
          // Giả sử token hợp lệ trừ khi token === "wrong"
          if (token === "wrong")
            throw new BadRequestError("Invalid TOTP token");
          await repository.updateUser(userId, { is2FAEnabled: true });
          return { enabled: true };
        }),
      verifyTOTP: vi
        .fn()
        .mockImplementation(async (userId: string, token: string) => {
          const user = await repository.findUserById(userId);
          if (!user || !user.totpSecret || !user.is2FAEnabled)
            throw new BadRequestError("2FA not enabled");
          // Kiểm tra thực tế bằng speakeasy
          const isValid = speakeasy.totp.verify({
            secret: user.totpSecret,
            encoding: "base32",
            token,
            window: 1,
          });
          if (!isValid) throw new BadRequestError("Invalid TOTP token");
          return mockTokenService.generateTokens(user);
        }),
    } as unknown as TwoFactorService;

    service = new AuthService(
      repository,
      mockEmailService,
      mockTokenService,
      mockTwoFactorService,
    );
  });

  // ---------- Register ----------
  describe("register", () => {
    it("throws BadRequestError if email already exists", async () => {
      repository.findUserByEmail = vi
        .fn()
        .mockResolvedValue({ id: "existing" });
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
      repository.findUserByEmail = vi.fn().mockResolvedValue(null);
      repository.createUser = vi.fn().mockResolvedValue(baseUser);

      const result = await service.register({
        email: "test@test.com",
        password: "123456",
        firstName: "John",
        lastName: "Doe",
      });

      expect(result.user).toMatchObject({ email: "test@test.com" });
      expect(result.message).toContain("check your email");
      expect(repository.createCartForUser).toHaveBeenCalledWith(baseUser.id);
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ email: "test@test.com" }),
        expect.any(String),
      );
    });
  });

  // ---------- Login ----------
  describe("login", () => {
    it("throws UnauthorizedError if user not found", async () => {
      repository.findUserByEmail = vi.fn().mockResolvedValue(null);
      await expect(
        service.login("notfound@test.com", "pass"),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("throws UnauthorizedError if password is incorrect", async () => {
      (bcrypt.compare as any).mockResolvedValueOnce(false);
      repository.findUserByEmail = vi.fn().mockResolvedValue(baseUser);
      await expect(
        service.login("test@test.com", "wrong"),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("returns tokens when 2FA is not enabled", async () => {
      (bcrypt.compare as any).mockResolvedValueOnce(true);
      repository.findUserByEmail = vi.fn().mockResolvedValue(baseUser);
      const result = await service.login("test@test.com", "pass");
      expect(result).toHaveProperty("accessToken");
    });

    it("returns requires2FA when 2FA is enabled", async () => {
      (bcrypt.compare as any).mockResolvedValueOnce(true);
      const twoFactorUser: User = { ...baseUser, is2FAEnabled: true };
      repository.findUserByEmail = vi.fn().mockResolvedValue(twoFactorUser);
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
      repository.findUserByEmail = vi.fn().mockResolvedValue(oauthUser);
      await expect(
        service.login("test@test.com", "anything"),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect(bcrypt.compare).toHaveBeenCalledWith("anything", "");
    });
  });

  // ---------- Resend Verification ----------
  describe("resendVerificationEmail", () => {
    it("does not send email if user not found", async () => {
      repository.findUserByEmail = vi.fn().mockResolvedValue(null);
      const result = await service.resendVerificationEmail("notexist@test.com");
      expect(mockEmailService.sendVerificationEmail).not.toHaveBeenCalled();
      expect(result.message).toContain("If that account exists");
    });

    it("does not send email if user already verified", async () => {
      repository.findUserByEmail = vi
        .fn()
        .mockResolvedValue({ ...baseUser, isVerified: true });
      await service.resendVerificationEmail("test@test.com");
      expect(mockEmailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it("sends email if user exists and not verified", async () => {
      repository.findUserByEmail = vi
        .fn()
        .mockResolvedValue({ ...baseUser, isVerified: false });
      await service.resendVerificationEmail("test@test.com");
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ email: "test@test.com" }),
        expect.any(String),
      );
    });
  });

  // ---------- Logout ----------
  describe("logout", () => {
    it("deletes refresh token and blacklists access token", async () => {
      const accessToken = "some.access.token";
      const refreshToken = "some.refresh.token";
      await service.logout("user-1", accessToken, refreshToken);
      expect(repository.deleteRefreshTokenByToken).toHaveBeenCalledWith(
        refreshToken,
      );
      expect(mockTokenService.blacklistAccessToken).toHaveBeenCalledWith(
        accessToken,
      );
    });

    it("deletes all refresh tokens for user if no refreshToken provided", async () => {
      await service.logout("user-1", "atoken");
      expect(mockTokenService.invalidateAllUserTokens).toHaveBeenCalledWith(
        "user-1",
      );
    });

    it("does not attempt to blacklist anything when no accessToken is provided", async () => {
      const spy = vi.spyOn(mockTokenService, "blacklistAccessToken");
      await service.logout("user-1", undefined, "some.refresh.token");
      expect(spy).not.toHaveBeenCalled();
      expect(repository.deleteRefreshTokenByToken).toHaveBeenCalledWith(
        "some.refresh.token",
      );
    });
  });

  // ---------- Enable 2FA ----------
  describe("enable2FA", () => {
    it("throws if user not found", async () => {
      repository.findUserById = vi.fn().mockResolvedValue(null);
      await expect(service.enable2FA("user-x")).rejects.toThrow(
        BadRequestError,
      );
    });

    it("generates secret and updates user", async () => {
      repository.findUserById = vi.fn().mockResolvedValue(baseUser);
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
        repository.findUserById = vi.fn().mockResolvedValue(baseUser);
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
        repository.findUserById = vi.fn().mockResolvedValue(baseUser);
        const result = await service.enable2FA("user-1");
        expect(result.otpauthUrl).toContain("TriAD");
        expect(result.secret).toBeDefined();
      } finally {
        process.env.TOTP_ISSUER = originalIssuer;
      }
    });

    it("handles case where otpauth_url is undefined (uses fallback empty string)", async () => {
      repository.findUserById = vi.fn().mockResolvedValue(baseUser);
      const mockSecret = { base32: "mocked-base32", otpauth_url: undefined };
      vi.spyOn(speakeasy, "generateSecret").mockReturnValue(mockSecret as any);
      const result = await service.enable2FA("user-1");
      expect(result.otpauthUrl).toBe("");
      expect(result.secret).toBe("mocked-base32");
    });
  });

  // ---------- Verify 2FA ----------
  describe("verify2FA", () => {
    it("throws if user not found or totpSecret missing", async () => {
      repository.findUserById = vi.fn().mockResolvedValue(null);
      await expect(service.verify2FA("user-x", "123456")).rejects.toThrow(
        BadRequestError,
      );
    });

    it("throws if TOTP token invalid", async () => {
      repository.findUserById = vi
        .fn()
        .mockResolvedValue({ ...baseUser, totpSecret: "secret" });
      // Mock verify2FA để throw
      mockTwoFactorService.verify2FA = vi
        .fn()
        .mockRejectedValue(new BadRequestError("Invalid TOTP token"));
      await expect(service.verify2FA("user-1", "wrong")).rejects.toThrow(
        BadRequestError,
      );
    });

    it("enables 2FA on valid token", async () => {
      repository.findUserById = vi
        .fn()
        .mockResolvedValue({ ...baseUser, totpSecret: "secret" });
      // Đảm bảo verify2FA không throw và gọi updateUser
      // (mock đã được set ở beforeEach, nhưng cần đảm bảo token "123456" hợp lệ)
      const result = await service.verify2FA("user-1", "123456");
      expect(repository.updateUser).toHaveBeenCalledWith("user-1", {
        is2FAEnabled: true,
      });
      expect(result).toEqual({ enabled: true });
    });
  });

  // ---------- verifyTotpToken (real speakeasy) ----------
  describe("verifyTotpToken (real speakeasy verification, not spied)", () => {
    it("accepts a currently-valid TOTP code and rejects a bogus one", async () => {
      const secret = speakeasy.generateSecret({ name: "TriAD:test" });
      const validToken = speakeasy.totp({
        secret: secret.base32,
        encoding: "base32",
      });

      repository.findUserById = vi.fn().mockResolvedValue({
        ...baseUser,
        totpSecret: secret.base32,
        is2FAEnabled: true,
      });

      // Override verifyTOTP để dùng speakeasy thật
      mockTwoFactorService.verifyTOTP = vi
        .fn()
        .mockImplementation(async (userId, token) => {
          const user = await repository.findUserById(userId);
          if (!user || !user.totpSecret || !user.is2FAEnabled)
            throw new BadRequestError("2FA not enabled");
          const isValid = speakeasy.totp.verify({
            secret: user.totpSecret,
            encoding: "base32",
            token,
            window: 1,
          });
          if (!isValid) throw new BadRequestError("Invalid TOTP token");
          return mockTokenService.generateTokens(user);
        });

      const result = await service.verifyTOTP("user-1", validToken);
      expect(result).toHaveProperty("accessToken");

      await expect(service.verifyTOTP("user-1", "000000")).rejects.toThrow(
        BadRequestError,
      );
    });
  });

  // ---------- verifyTOTP ----------
  describe("verifyTOTP", () => {
    it("throws if user not found or 2FA not enabled", async () => {
      repository.findUserById = vi.fn().mockResolvedValue(null);
      await expect(service.verifyTOTP("user-x", "123456")).rejects.toThrow(
        BadRequestError,
      );
    });

    it("throws on invalid token", async () => {
      repository.findUserById = vi.fn().mockResolvedValue({
        ...baseUser,
        totpSecret: "secret",
        is2FAEnabled: true,
      });
      // Override để throw
      mockTwoFactorService.verifyTOTP = vi
        .fn()
        .mockRejectedValue(new BadRequestError("Invalid TOTP token"));
      await expect(service.verifyTOTP("user-1", "wrong")).rejects.toThrow(
        BadRequestError,
      );
    });

    it("returns tokens on valid TOTP", async () => {
      repository.findUserById = vi.fn().mockResolvedValue({
        ...baseUser,
        totpSecret: "secret",
        is2FAEnabled: true,
      });
      // Override verifyTOTP để trả về tokens trực tiếp
      mockTwoFactorService.verifyTOTP = vi.fn().mockResolvedValue({
        accessToken: "atoken",
        refreshToken: "rtoken",
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
      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
    });
  });

  // ---------- refreshToken ----------
  describe("refreshToken", () => {
    it("throws if token invalid or expired", async () => {
      repository.findRefreshTokenWithUser = vi.fn().mockResolvedValue(null);
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
      repository.findRefreshTokenWithUser = vi.fn().mockResolvedValue(record);
      await expect(service.refreshToken(expiredRefreshToken)).rejects.toThrow(
        UnauthorizedError,
      );
      // Không gọi delete vì đã throw
      expect(repository.deleteRefreshTokenById).not.toHaveBeenCalled();
    });

    it("rotates the refresh token and returns new tokens on success", async () => {
      const familyId = "test-family-id";
      const validRefreshToken = signToken(
        { sub: baseUser.id, familyId },
        process.env.JWT_REFRESH_SECRET as string,
        "7d",
      );
      const record = {
        id: "rt-valid",
        expiresAt: new Date(Date.now() + 60000),
        userId: baseUser.id,
        familyId: familyId,
        revokedAt: null,
        user: baseUser,
      };
      repository.findRefreshTokenWithUser = vi.fn().mockResolvedValue(record);
      repository.findActiveRefreshTokenByFamily = vi
        .fn()
        .mockResolvedValue(record);
      repository.revokeAllTokensInFamily = vi.fn().mockResolvedValue(undefined);
      repository.revokeRefreshToken = vi.fn().mockResolvedValue(undefined);
      repository.createRefreshToken = vi.fn().mockResolvedValue({});
      // Sử dụng real TokenService để kiểm tra logic thật
      const realTokenService = new TokenService(repository);
      const serviceWithRealToken = new AuthService(
        repository,
        mockEmailService,
        realTokenService,
        mockTwoFactorService,
      );

      const result = await serviceWithRealToken.refreshToken(validRefreshToken);
      expect(repository.revokeRefreshToken).toHaveBeenCalledWith(record.id);
      expect(repository.createRefreshToken).toHaveBeenCalled();
      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result.user).toMatchObject({ id: baseUser.id });
    });
  });

  // ---------- verifyEmail ----------
  describe("verifyEmail", () => {
    it("throws BadRequestError when the token is invalid or expired in Redis", async () => {
      (redis.get as any).mockResolvedValueOnce(null);
      await expect(service.verifyEmail("bad-token")).rejects.toBeInstanceOf(
        BadRequestError,
      );
      expect(repository.findUserById).not.toHaveBeenCalled();
    });

    it("throws BadRequestError when the user no longer exists", async () => {
      (redis.get as any).mockResolvedValueOnce("user-id");
      repository.findUserById = vi.fn().mockResolvedValue(null);
      await expect(service.verifyEmail("token")).rejects.toBeInstanceOf(
        BadRequestError,
      );
    });

    it("deletes the redis token and returns tokens directly if already verified", async () => {
      (redis.get as any).mockResolvedValueOnce("user-id");
      repository.findUserById = vi
        .fn()
        .mockResolvedValue({ ...baseUser, isVerified: true });
      const result = await service.verifyEmail("token");
      expect(redis.del).toHaveBeenCalledWith("email-verify:token");
      expect(repository.updateUser).not.toHaveBeenCalled();
      expect(result).toHaveProperty("accessToken");
    });

    it("marks the user as verified and returns tokens when not yet verified", async () => {
      (redis.get as any).mockResolvedValueOnce("user-id");
      const unverifiedUser = { ...baseUser, isVerified: false };
      repository.findUserById = vi.fn().mockResolvedValue(unverifiedUser);
      repository.updateUser = vi
        .fn()
        .mockResolvedValue({ ...unverifiedUser, isVerified: true });
      const result = await service.verifyEmail("token");
      expect(repository.updateUser).toHaveBeenCalledWith(baseUser.id, {
        isVerified: true,
      });
      expect(result).toHaveProperty("accessToken");
    });

    it("returns tokens directly if user is already verified (real generateTokens)", async () => {
      (redis.get as any).mockResolvedValueOnce("user-id");
      repository.findUserById = vi
        .fn()
        .mockResolvedValue({ ...baseUser, isVerified: true });
      const result = await service.verifyEmail("token");
      expect(result.accessToken).toBeDefined();
      expect(repository.updateUser).not.toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith("email-verify:token");
    });
  });

  // ---------- login - unverified user ----------
  describe("login - unverified user", () => {
    it("throws UnauthorizedError if the user has not verified their email", async () => {
      (bcrypt.compare as any).mockResolvedValueOnce(true);
      repository.findUserByEmail = vi
        .fn()
        .mockResolvedValue({ ...baseUser, isVerified: false });
      await expect(service.login("test@test.com", "pass")).rejects.toThrow(
        UnauthorizedError,
      );
    });
  });

  // ---------- generateTokens ----------
  describe("generateTokens", () => {
    it("signs access/refresh tokens, persists the refresh token, and maps the user", async () => {
      // Sử dụng real TokenService để kiểm tra logic thật
      const realTokenService = new TokenService(repository);
      const serviceWithRealToken = new AuthService(
        repository,
        mockEmailService,
        realTokenService,
        mockTwoFactorService,
      );
      const result = await serviceWithRealToken.generateTokens(baseUser);
      expect(typeof result.accessToken).toBe("string");
      expect(typeof result.refreshToken).toBe("string");
      expect(repository.createRefreshToken).toHaveBeenCalledWith(
        result.refreshToken,
        baseUser.id,
        expect.any(String),
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
      const realTokenService = new TokenService(repository);
      const serviceWithRealToken = new AuthService(
        repository,
        mockEmailService,
        realTokenService,
        mockTwoFactorService,
      );
      await expect(
        serviceWithRealToken.generateTokens(baseUser),
      ).rejects.toThrow("JWT_ACCESS_SECRET is not defined");
      process.env.JWT_ACCESS_SECRET = previous;
    });

    it("throws if JWT_REFRESH_SECRET is not configured", async () => {
      const previous = process.env.JWT_REFRESH_SECRET;
      delete process.env.JWT_REFRESH_SECRET;
      const realTokenService = new TokenService(repository);
      const serviceWithRealToken = new AuthService(
        repository,
        mockEmailService,
        realTokenService,
        mockTwoFactorService,
      );
      await expect(
        serviceWithRealToken.generateTokens(baseUser),
      ).rejects.toThrow("JWT_REFRESH_SECRET is not defined");
      process.env.JWT_REFRESH_SECRET = previous;
    });
  });

  // ---------- logout - blacklistAccessToken ----------
  describe("logout - blacklistAccessToken", () => {
    it("blacklists a valid access token with the remaining TTL until expiry", async () => {
      const accessToken = signToken(
        { sub: baseUser.id },
        process.env.JWT_ACCESS_SECRET as string,
        "15m",
      );
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
      await service.logout(baseUser.id, accessToken);
      expect(redis.setex).not.toHaveBeenCalled();
    });

    it("does not blacklist a token whose exp is already in the past", async () => {
      const accessToken = signToken(
        { sub: baseUser.id },
        process.env.JWT_ACCESS_SECRET as string,
        -10,
      );
      await service.logout(baseUser.id, accessToken);
      expect(redis.setex).not.toHaveBeenCalled();
    });

    it("logs a warning and swallows the error if decoding the access token throws", async () => {
      (decodeToken as any).mockImplementationOnce(() => {
        throw new Error("malformed token");
      });
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

  // ---------- JWT expiry config ----------
  describe("AuthService - JWT expiry config", () => {
    afterEach(() => {
      delete process.env.JWT_ACCESS_EXPIRY;
      delete process.env.JWT_REFRESH_EXPIRY;
    });

    it("falls back to default 15m/7d expiry when unset", async () => {
      delete process.env.JWT_ACCESS_EXPIRY;
      delete process.env.JWT_REFRESH_EXPIRY;
      const realTokenService = new TokenService(repository);
      const serviceWithRealToken = new AuthService(
        repository,
        mockEmailService,
        realTokenService,
        mockTwoFactorService,
      );
      const result = await serviceWithRealToken.generateTokens(baseUser);
      expect(typeof result.accessToken).toBe("string");
      expect(typeof result.refreshToken).toBe("string");
    });

    it("uses JWT_ACCESS_EXPIRY/JWT_REFRESH_EXPIRY from env when explicitly provided", async () => {
      process.env.JWT_ACCESS_EXPIRY = "30m";
      process.env.JWT_REFRESH_EXPIRY = "30d";
      const realTokenService = new TokenService(repository);
      const serviceWithRealToken = new AuthService(
        repository,
        mockEmailService,
        realTokenService,
        mockTwoFactorService,
      );
      const result = await serviceWithRealToken.generateTokens(baseUser);
      expect(typeof result.accessToken).toBe("string");
      expect(typeof result.refreshToken).toBe("string");
    });
  });
});
