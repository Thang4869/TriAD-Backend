import { beforeEach, describe, expect, it, vi } from "vitest";
import speakeasy from "speakeasy";
import { TwoFactorService } from "@modules/auth/services/two-factor.service";
import type { IAuthRepository } from "@modules/auth/application/ports/auth.repository.port";
import type { TokenService } from "@modules/auth/services/token.service";
import type { TokenStorePort } from "@modules/auth/application/ports/token-store.port";
import { ValidationError, AuthenticationError } from "@shared/errors/application-error";
import config from "@config";
import { encryptTotpSecret } from "@modules/auth/services/totp-secret.crypto";

const secret = "JBSWY3DPEHPK3PXP";
const user = { id: "user-1", email: "user@example.com", firstName: "Test", lastName: "User", role: "USER", is2FAEnabled: true, totpSecret: encryptTotpSecret(secret, config.TOTP_ENCRYPTION_KEY) };
function setup(userResult: unknown = user, accepted = true) {
  const repository = { findUserById: vi.fn().mockResolvedValue(userResult), updateUser: vi.fn().mockResolvedValue(undefined) } as unknown as IAuthRepository;
  const tokenService = { consumeTwoFactorPreAuthToken: vi.fn().mockResolvedValue("user-1"), generateTokens: vi.fn().mockResolvedValue({ accessToken: "a", refreshToken: "r", user }) } as unknown as TokenService;
  const tokenStore = { setIfAbsent: vi.fn().mockResolvedValue(accepted) } as unknown as TokenStorePort;
  return { service: new TwoFactorService(repository, tokenService, tokenStore), repository, tokenService, tokenStore };
}
function validCode() { return speakeasy.totp({ secret, encoding: "base32", time: Math.floor(Date.now() / 1000) }); }

describe("TwoFactorService uncovered branches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects enabling 2FA for an unknown user", async () => {
    const { service, repository } = setup(null);
    await expect(service.enable2FA("missing")).rejects.toBeInstanceOf(ValidationError);
    expect(repository.updateUser).not.toHaveBeenCalled();
  });

  it("stores an encrypted secret while leaving 2FA disabled until verified", async () => {
    const { service, repository } = setup({ ...user, is2FAEnabled: false, totpSecret: null });
    const result = await service.enable2FA("user-1");
    expect(result.secret).toBeTruthy();
    expect(repository.updateUser).toHaveBeenCalledWith("user-1", expect.objectContaining({ is2FAEnabled: false, totpSecret: expect.any(String) }));
  });

  it("rejects verification when the user has no 2FA secret", async () => {
    const { service } = setup({ ...user, totpSecret: null });
    await expect(service.verify2FA("user-1", "123456")).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an invalid setup TOTP", async () => {
    const { service, repository } = setup();
    await expect(service.verify2FA("user-1", "000000")).rejects.toBeInstanceOf(ValidationError);
    expect(repository.updateUser).not.toHaveBeenCalled();
  });

  it("rejects login verification when the account no longer has 2FA enabled", async () => {
    const { service, tokenStore } = setup({ ...user, is2FAEnabled: false });
    await expect(service.verifyTOTP("pre-auth", validCode())).rejects.toBeInstanceOf(AuthenticationError);
    expect(tokenStore.setIfAbsent).not.toHaveBeenCalled();
  });

  it("rejects a replayed TOTP before generating tokens", async () => {
    const { service, tokenService, tokenStore } = setup(user, false);
    await expect(service.verifyTOTP("pre-auth", validCode())).rejects.toThrow("already used");
    expect(tokenStore.setIfAbsent).toHaveBeenCalledWith(expect.stringContaining("auth:2fa:totp:user-1:"), "1", 90);
    expect(tokenService.generateTokens).not.toHaveBeenCalled();
  });
});
