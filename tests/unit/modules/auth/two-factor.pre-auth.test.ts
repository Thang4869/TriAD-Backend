import { describe, expect, it, vi } from "vitest";
import speakeasy from "speakeasy";
import { TwoFactorService } from "@modules/auth/services/two-factor.service";
import { TokenService } from "@modules/auth/services/token.service";
import type { IAuthRepository } from "@modules/auth/auth.repository";
import config from "@config";
import { encryptTotpSecret } from "@modules/auth/services/totp-secret.crypto";

function createTokenStore() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getAndDelete: vi.fn().mockResolvedValue(null),
    setIfAbsent: vi.fn().mockResolvedValue(true),
  };
}

const rawTotpSecret = "JBSWY3DPEHPK3PXP";

const user = {
  id: "user-1",
  email: "user@example.com",
  firstName: "Test",
  lastName: "User",
  role: "USER",
  is2FAEnabled: true,
  totpSecret: encryptTotpSecret(rawTotpSecret, config.TOTP_ENCRYPTION_KEY),
};

describe("TOTP pre-authentication", () => {
  it("rejects direct userId verification without a password proof", async () => {
    const repository = {
      findUserById: vi.fn().mockResolvedValue(user),
    } as unknown as IAuthRepository;

    const tokenService = {
      consumeTwoFactorPreAuthToken: vi
        .fn()
        .mockRejectedValue(new Error("Pre-authentication token required")),
      generateTokens: vi.fn().mockResolvedValue({
        accessToken: "access",
        refreshToken: "refresh",
        user,
      }),
    } as unknown as TokenService;

    const service = new TwoFactorService(
      repository,
      tokenService,
      createTokenStore(),
    );

    const validTotp = speakeasy.totp({
      secret: rawTotpSecret,
      encoding: "base32",
      time: Math.floor(Date.now() / 1000),
    });

    await expect(service.verifyTOTP("user-1", validTotp)).rejects.toThrow(
      "Pre-authentication token required",
    );
  });

  it("accepts a valid pre-auth token once and rejects its TOTP replay", async () => {
    const repository = {
      findUserById: vi.fn().mockResolvedValue(user),
    } as unknown as IAuthRepository;

    const tokenService = {
      consumeTwoFactorPreAuthToken: vi.fn().mockResolvedValue("user-1"),
      generateTokens: vi.fn().mockResolvedValue({
        accessToken: "a",
        refreshToken: "r",
        user,
      }),
    } as unknown as TokenService;

    const tokenStore = createTokenStore();

    tokenStore.setIfAbsent
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const service = new TwoFactorService(repository, tokenService, tokenStore);

    const validTotp = speakeasy.totp({
      secret: rawTotpSecret,
      encoding: "base32",
      time: Math.floor(Date.now() / 1000),
    });

    await expect(
      service.verifyTOTP("pre-auth", validTotp),
    ).resolves.toMatchObject({
      accessToken: "a",
    });

    await expect(service.verifyTOTP("pre-auth-2", validTotp)).rejects.toThrow(
      "already used",
    );
  });

  it.each(["missing", "expired", "used"])(
    "rejects a %s pre-auth token",
    async () => {
      const repository = {
        findUserById: vi.fn(),
      } as unknown as IAuthRepository;

      const tokenService = {
        consumeTwoFactorPreAuthToken: vi
          .fn()
          .mockRejectedValue(
            new Error("Invalid or expired pre-authentication token"),
          ),
      } as unknown as TokenService;

      const service = new TwoFactorService(
        repository,
        tokenService,
        createTokenStore(),
      );

      await expect(service.verifyTOTP("bad-token", "123456")).rejects.toThrow(
        /pre-authentication token/i,
      );

      expect(repository.findUserById).not.toHaveBeenCalled();
    },
  );
});
