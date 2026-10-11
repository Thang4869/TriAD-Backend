import crypto from "crypto";
import { describe, expect, it, vi } from "vitest";
import { TokenService } from "@modules/auth/services/token.service";
import type { IAuthRepository } from "@modules/auth/application/ports/auth.repository.port";
import type { AuthUser } from "@modules/auth/application/ports/auth-user";
import config from "@config";
import { signToken } from "@shared/utils/jwt";
import { AuthenticationError } from "@shared/errors/application-error";
import { SECURITY } from "@shared/constants/security.constant";

const user = {
  id: "user-1",
  email: "user@example.com",
  role: "USER",
  firstName: "One",
  lastName: "Two",
  is2FAEnabled: false,
} as AuthUser;

const repo = () =>
  ({
    createRefreshToken: vi.fn().mockResolvedValue(undefined),
    findRefreshTokenWithUser: vi.fn().mockResolvedValue(null),
  }) as unknown as IAuthRepository;

const store = () => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  getAndDelete: vi.fn().mockResolvedValue(null),
  delete: vi.fn().mockResolvedValue(undefined),
  setIfAbsent: vi.fn().mockResolvedValue(true),
});

describe("JWT token-class enforcement with real signatures", () => {
  it("issues verifiable access with jti, iss, aud, tokenType and exp", async () => {
    const service = new TokenService(repo(), store());
    const tokens = await service.generateTokens(user);
    const claims = service.verifyAccessToken(tokens.accessToken);
    expect(claims).toMatchObject({
      sub: user.id,
      email: user.email,
      tokenType: "access",
      iss: config.JWT_ISSUER,
      aud: config.JWT_ACCESS_AUDIENCE,
    });
    expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(() => service.verifyAccessToken(tokens.refreshToken)).toThrow(
      AuthenticationError,
    );
  });

  it("rejects access tokens signed with wrong audience, issuer or class", () => {
    const service = new TokenService(repo(), store());
    const base = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: crypto.randomUUID(),
      tokenType: "access",
      iss: config.JWT_ISSUER,
      aud: config.JWT_ACCESS_AUDIENCE,
    };
    for (const overrides of [
      { aud: config.JWT_REFRESH_AUDIENCE },
      { iss: "invalid-issuer" },
      { tokenType: "refresh" },
      { jti: undefined },
    ]) {
      const token = signToken(
        { ...base, ...overrides },
        config.JWT_ACCESS_SECRET,
        "15m",
      );
      expect(() => service.verifyAccessToken(token)).toThrow(
        AuthenticationError,
      );
    }
  });

  it("refuses to use a signed access token as refresh or 2FA preauth", async () => {
    const authRepo = repo();
    const tokenStore = store();
    const service = new TokenService(authRepo, tokenStore);
    const { accessToken } = await service.generateTokens(user);
    await expect(service.refreshToken(accessToken)).rejects.toThrow(
      AuthenticationError,
    );
    await expect(
      service.consumeTwoFactorPreAuthToken(accessToken),
    ).rejects.toThrow(AuthenticationError);
    expect(authRepo.findRefreshTokenWithUser).not.toHaveBeenCalled();
    expect(tokenStore.getAndDelete).not.toHaveBeenCalled();
  });

  it("hashes jti rather than storing JWT in Redis blacklist keys", async () => {
    const tokenStore = store();
    const service = new TokenService(repo(), tokenStore);
    const { accessToken } = await service.generateTokens(user);
    const { jti } = service.verifyAccessToken(accessToken);
    await service.blacklistAccessToken(accessToken);
    const key = `${SECURITY.BLACKLIST_KEY_PREFIX}${crypto.createHash("sha256").update(jti).digest("hex")}`;
    expect(tokenStore.set).toHaveBeenCalledWith(key, "1", expect.any(Number));
    expect(key).not.toContain(accessToken);
  });
});
