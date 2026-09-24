import { describe, expect, it, vi } from "vitest";
import speakeasy from "speakeasy";
import { TwoFactorService } from "@modules/auth/services/two-factor.service";
import { TokenService } from "@modules/auth/services/token.service";
import type { IAuthRepository } from "@modules/auth/auth.repository";

const { redisMock } = vi.hoisted(() => ({
  redisMock: { set: vi.fn() },
}));

vi.mock("@core/redis/client", () => ({ default: redisMock }));

const user = {
  id: "user-1",
  email: "user@example.com",
  firstName: "Test",
  lastName: "User",
  role: "USER",
  is2FAEnabled: true,
  totpSecret: "JBSWY3DPEHPK3PXP",
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
    const service = new TwoFactorService(repository, tokenService);

    const validTotp = speakeasy.totp({
      secret: user.totpSecret,
      encoding: "base32",
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
      generateTokens: vi
        .fn()
        .mockResolvedValue({ accessToken: "a", refreshToken: "r", user }),
    } as unknown as TokenService;
    redisMock.set.mockResolvedValueOnce("OK").mockResolvedValueOnce(null);
    const service = new TwoFactorService(repository, tokenService);
    const validTotp = speakeasy.totp({
      secret: user.totpSecret,
      encoding: "base32",
    });

    await expect(
      service.verifyTOTP("pre-auth", validTotp),
    ).resolves.toMatchObject({ accessToken: "a" });
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
      const service = new TwoFactorService(repository, tokenService);

      await expect(service.verifyTOTP("bad-token", "123456")).rejects.toThrow(
        /pre-authentication token/i,
      );
      expect(repository.findUserById).not.toHaveBeenCalled();
    },
  );
});
