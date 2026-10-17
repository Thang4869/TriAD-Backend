import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TokenService } from "@modules/auth/services/token.service";
import type { IAuthRepository } from "@modules/auth/application/ports/auth.repository.port";
import { AuthRefreshTokenWithUser } from "@modules/auth/application/ports/auth-refresh-token";
import { AuthenticationError } from "@shared/errors/application-error";
import { signToken, verifyToken } from "@shared/utils/jwt";
import crypto from "crypto";
import { DependencyUnavailableError } from "@shared/errors/application-error";
import { SECURITY } from "@shared/constants/security.constant";
import config from "@config";

vi.mock("@shared/utils/jwt", () => ({
  signToken: vi.fn(),
  verifyToken: vi.fn(),
}));

const user = {
  id: "user-1",
  email: "a@example.com",
  firstName: "A",
  lastName: "B",
  role: "USER",
  is2FAEnabled: false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

function createRepo(overrides: Partial<IAuthRepository> = {}): IAuthRepository {
  return {
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    createRefreshToken: vi.fn().mockResolvedValue({}),
    findRefreshTokenByToken: vi.fn(),
    revokeRefreshToken: vi.fn().mockResolvedValue(true),
    rotateRefreshToken: vi.fn().mockResolvedValue(true),
    findRefreshTokenWithUser: vi.fn().mockResolvedValue(null),
    deleteRefreshTokenById: vi.fn(),
    deleteRefreshTokenByToken: vi.fn(),
    deleteRefreshTokensByUserId: vi.fn().mockResolvedValue(undefined),
    findRefreshTokenByFamilyAndToken: vi.fn(),
    findActiveRefreshTokenByFamily: vi.fn().mockResolvedValue(null),
    revokeAllTokensInFamily: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as IAuthRepository;
}

function createTokenStore() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getAndDelete: vi.fn().mockResolvedValue(null),
    setIfAbsent: vi.fn().mockResolvedValue(true),
  };
}

function tokenRecord(
  overrides: Partial<AuthRefreshTokenWithUser> = {},
): AuthRefreshTokenWithUser {
  return {
    id: "rt-1",
    token: "refresh-token",
    userId: "user-1",
    familyId: "fam-1",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    user,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(overrides as any),
  } as AuthRefreshTokenWithUser;
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();

  Object.assign(config, {
    JWT_ACCESS_SECRET: "access-secret",
    JWT_REFRESH_SECRET: "refresh-secret",
    JWT_ACCESS_EXPIRY: "15m",
    JWT_ISSUER: "triad-backend",
    JWT_ACCESS_AUDIENCE: "triad:access",
    JWT_REFRESH_AUDIENCE: "triad:refresh",
    JWT_PREAUTH_AUDIENCE: "triad:preauth",
    JWT_REFRESH_EXPIRY: "7d",
  });

  vi.mocked(signToken).mockImplementation((_p, secret) =>
    secret === "access-secret" ? "ACCESS" : "REFRESH",
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(verifyToken).mockReturnValue({
    familyId: "fam-1",
    sub: "user-1",
    jti: "jti-1",
    iss: "triad-backend",
    aud: "triad:refresh",
    tokenType: "refresh",
    exp: Math.floor(Date.now() / 1000) + 300,
  } as any);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("TokenService.generateTokens", () => {
  it("ký access + refresh token và lưu refresh token xuống DB", async () => {
    const repo = createRepo();
    const service = new TokenService(repo, createTokenStore());

    const result = await service.generateTokens(user);

    expect(result.accessToken).toBe("ACCESS");
    expect(result.refreshToken).toBe("REFRESH");
    expect(result.user).toEqual({
      id: "user-1",
      email: "a@example.com",
      firstName: "A",
      lastName: "B",
      role: "USER",
      is2FAEnabled: false,
    });

    expect(repo.createRefreshToken).toHaveBeenCalledWith(
      "REFRESH",
      "user-1",
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      expect.any(Date),
    );
  });

  it("dùng expiry mặc định 15m / 7d khi env không đặt", async () => {
    await new TokenService(createRepo(), createTokenStore()).generateTokens(
      user,
    );

    expect(signToken).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sub: "user-1",
        role: "USER",
      }),
      "access-secret",
      "15m",
    );

    expect(signToken).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sub: "user-1",
      }),
      "refresh-secret",
      "7d",
    );
  });

  it("tôn trọng JWT_ACCESS_EXPIRY / JWT_REFRESH_EXPIRY từ env", async () => {
    Object.assign(config, {
      JWT_ACCESS_EXPIRY: "5m",
      JWT_REFRESH_EXPIRY: "2d",
    });

    await new TokenService(createRepo(), createTokenStore()).generateTokens(
      user,
    );

    expect(signToken).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "access-secret",
      "5m",
    );

    expect(signToken).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "refresh-secret",
      "2d",
    );
  });

  it("tái sử dụng familyId được truyền vào (token rotation)", async () => {
    await new TokenService(createRepo(), createTokenStore()).generateTokens(
      user,
      "fam-existing",
    );

    expect(signToken).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        familyId: "fam-existing",
      }),
      "refresh-secret",
      "7d",
    );
  });

  it("sinh familyId mới khi không truyền", async () => {
    await new TokenService(createRepo(), createTokenStore()).generateTokens(
      user,
    );

    const payload = vi.mocked(signToken).mock.calls[1][0] as {
      familyId: string;
    };

    expect(payload.familyId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("ép is2FAEnabled về false khi giá trị là null/undefined", async () => {
    const result = await new TokenService(
      createRepo(),
      createTokenStore(),
    ).generateTokens({
      ...user,
      is2FAEnabled: null,
    });

    expect(result.user.is2FAEnabled).toBe(false);
  });
});

describe("TokenService.refreshToken", () => {
  it("xoay token thành công: revoke token cũ và cấp cặp token mới", async () => {
    const repo = createRepo({
      findRefreshTokenWithUser: vi.fn().mockResolvedValue(tokenRecord()),
    });

    const tokenStore = createTokenStore();

    const result = await new TokenService(repo, tokenStore).refreshToken(
      "refresh-token",
    );

    expect(repo.rotateRefreshToken).toHaveBeenCalledWith(
      "rt-1",
      "REFRESH",
      "user-1",
      "fam-1",
      expect.any(Date),
    );

    expect(result.accessToken).toBe("ACCESS");
    expect(result.refreshToken).toBe("REFRESH");
    expect(repo.createRefreshToken).not.toHaveBeenCalled();
  });

  it("từ chối khi token không có trong DB", async () => {
    const repo = createRepo();

    await expect(
      new TokenService(repo, createTokenStore()).refreshToken("khong-co"),
    ).rejects.toThrow(AuthenticationError);
  });

  it("phát hiện reuse: token đã revoke thì huỷ cả family", async () => {
    const repo = createRepo({
      findRefreshTokenWithUser: vi.fn().mockResolvedValue(
        tokenRecord({
          revokedAt: new Date(),
        }),
      ),
    });

    await expect(
      new TokenService(repo, createTokenStore()).refreshToken("refresh-token"),
    ).rejects.toThrow(/theft/i);

    expect(repo.revokeAllTokensInFamily).toHaveBeenCalledWith("fam-1");
  });

  it("từ chối token đã hết hạn", async () => {
    const repo = createRepo({
      findRefreshTokenWithUser: vi.fn().mockResolvedValue(
        tokenRecord({
          expiresAt: new Date(Date.now() - 1_000),
        }),
      ),
    });

    await expect(
      new TokenService(repo, createTokenStore()).refreshToken("refresh-token"),
    ).rejects.toThrow(/expired/i);
  });

  it("từ chối khi familyId trong JWT lệch với DB", async () => {
    const repo = createRepo({
      findRefreshTokenWithUser: vi.fn().mockResolvedValue(
        tokenRecord({
          familyId: "fam-khac",
        }),
      ),
    });

    await expect(
      new TokenService(repo, createTokenStore()).refreshToken("refresh-token"),
    ).rejects.toThrow(/Family ID mismatch/);
  });

  it("từ chối khi userId trong JWT lệch với DB", async () => {
    const repo = createRepo({
      findRefreshTokenWithUser: vi.fn().mockResolvedValue(
        tokenRecord({
          userId: "user-khac",
        }),
      ),
    });

    await expect(
      new TokenService(repo, createTokenStore()).refreshToken("refresh-token"),
    ).rejects.toThrow(/User ID mismatch/);
  });

  it("cho phép dùng lại trong grace period 30s khi có token mới hơn", async () => {
    const repo = createRepo({
      findRefreshTokenWithUser: vi.fn().mockResolvedValue(tokenRecord()),
      findActiveRefreshTokenByFamily: vi.fn().mockResolvedValue({
        id: "rt-2",
        createdAt: new Date(Date.now() - 5_000),
      }),
    });

    await expect(
      new TokenService(repo, createTokenStore()).refreshToken("refresh-token"),
    ).resolves.toBeDefined();

    expect(repo.revokeAllTokensInFamily).not.toHaveBeenCalled();
  });

  it("chặn token đã bị thay thế khi quá grace period", async () => {
    const repo = createRepo({
      findRefreshTokenWithUser: vi.fn().mockResolvedValue(tokenRecord()),
      findActiveRefreshTokenByFamily: vi.fn().mockResolvedValue({
        id: "rt-2",
        createdAt: new Date(Date.now() - 60_000),
      }),
    });

    await expect(
      new TokenService(repo, createTokenStore()).refreshToken("refresh-token"),
    ).rejects.toThrow(/superseded/i);

    expect(repo.revokeAllTokensInFamily).toHaveBeenCalledWith("fam-1");
  });

  it("bỏ qua kiểm tra superseded khi token mới nhất chính là nó", async () => {
    const repo = createRepo({
      findRefreshTokenWithUser: vi.fn().mockResolvedValue(tokenRecord()),
      findActiveRefreshTokenByFamily: vi.fn().mockResolvedValue({
        id: "rt-1",
        createdAt: new Date(Date.now() - 60_000),
      }),
    });

    await expect(
      new TokenService(repo, createTokenStore()).refreshToken("refresh-token"),
    ).resolves.toBeDefined();
  });

  it("gói mọi lỗi lạ thành AuthenticationError", async () => {
    vi.mocked(verifyToken).mockImplementation(() => {
      throw new Error("jwt malformed");
    });

    await expect(
      new TokenService(createRepo(), createTokenStore()).refreshToken("rác"),
    ).rejects.toThrow(AuthenticationError);
  });

  it("từ chối refresh khi token đã được request khác revoke trước", async () => {
    const repo = createRepo({
      findRefreshTokenWithUser: vi.fn().mockResolvedValue(tokenRecord()),
      rotateRefreshToken: vi.fn().mockResolvedValue(false),
    });

    await expect(
      new TokenService(repo, createTokenStore()).refreshToken("refresh-token"),
    ).rejects.toThrow(/already used/i);

    expect(repo.rotateRefreshToken).toHaveBeenCalledWith(
      "rt-1",
      "REFRESH",
      "user-1",
      "fam-1",
      expect.any(Date),
    );
    expect(repo.createRefreshToken).not.toHaveBeenCalled();
  });
});

describe("TokenService.invalidateAllUserTokens", () => {
  it("xoá toàn bộ refresh token của user", async () => {
    const repo = createRepo();

    await new TokenService(repo, createTokenStore()).invalidateAllUserTokens(
      "user-1",
    );

    expect(repo.deleteRefreshTokensByUserId).toHaveBeenCalledWith("user-1");
  });
});

const validAccessClaims = () => ({
  sub: "user-1",
  email: "a@example.com",
  role: "USER",
  jti: "access-jti-1",
  iss: "triad-backend",
  aud: "triad:access",
  tokenType: "access",
  exp: Math.floor(Date.now() / 1000) + 300,
});

const hashedRevocationKey = () =>
  `${SECURITY.BLACKLIST_KEY_PREFIX}${crypto.createHash("sha256").update("access-jti-1").digest("hex")}`;

describe("TokenService access-token claims and revocation", () => {
  it("verifies access token issuer, audience and mandatory class claims", () => {
    vi.mocked(verifyToken).mockReturnValue(validAccessClaims());
    const service = new TokenService(createRepo(), createTokenStore());
    expect(service.verifyAccessToken("ACCESS").tokenType).toBe("access");
    expect(verifyToken).toHaveBeenCalledWith("ACCESS", "access-secret", {
      issuer: "triad-backend",
      audience: "triad:access",
    });
  });

  it.each([
    { tokenType: "refresh" },
    { aud: "triad:refresh" },
    { iss: "foreign-issuer" },
    { jti: undefined },
    { exp: undefined },
    { email: 123 },
  ])("rejects invalid access token claims: %j", (overrides) => {
    vi.mocked(verifyToken).mockReturnValue({
      ...validAccessClaims(),
      ...overrides,
    });
    expect(() =>
      new TokenService(createRepo(), createTokenStore()).verifyAccessToken(
        "ACCESS",
      ),
    ).toThrow(AuthenticationError);
  });

  it("refuses refresh token with access-token purpose without querying the DB", async () => {
    vi.mocked(verifyToken).mockReturnValue(validAccessClaims());
    const repo = createRepo();
    await expect(
      new TokenService(repo, createTokenStore()).refreshToken("ACCESS"),
    ).rejects.toThrow(AuthenticationError);
    expect(repo.findRefreshTokenWithUser).not.toHaveBeenCalled();
  });

  it("signs all issued access and refresh tokens with different audience and class", async () => {
    await new TokenService(createRepo(), createTokenStore()).generateTokens(
      user,
    );
    expect(signToken).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tokenType: "access",
        iss: "triad-backend",
        aud: "triad:access",
        jti: expect.any(String),
      }),
      "access-secret",
      "15m",
    );
    expect(signToken).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tokenType: "refresh",
        iss: "triad-backend",
        aud: "triad:refresh",
        jti: expect.any(String),
      }),
      "refresh-secret",
      "7d",
    );
  });

  it("signs and consumes single-use preauth token with isolated class", async () => {
    const store = createTokenStore();
    vi.mocked(verifyToken).mockReturnValue({
      ...validAccessClaims(),
      tokenType: "preauth",
      aud: "triad:preauth",
      purpose: "2fa",
    });
    store.getAndDelete.mockResolvedValueOnce("user-1");
    const service = new TokenService(createRepo(), store);
    await service.issueTwoFactorPreAuthToken("user-1");
    expect(signToken).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenType: "preauth",
        aud: "triad:preauth",
        purpose: "2fa",
        jti: expect.any(String),
      }),
      expect.any(String),
      "5m",
    );
    await expect(service.consumeTwoFactorPreAuthToken("PREAUTH")).resolves.toBe(
      "user-1",
    );
    expect(verifyToken).toHaveBeenCalledWith("PREAUTH", expect.any(String), {
      issuer: "triad-backend",
      audience: "triad:preauth",
    });
  });

  it("rejects preauth with wrong purpose and never consumes Redis nonce", async () => {
    vi.mocked(verifyToken).mockReturnValue({
      ...validAccessClaims(),
      tokenType: "preauth",
      aud: "triad:preauth",
      purpose: "access",
    });
    const store = createTokenStore();
    await expect(
      new TokenService(createRepo(), store).consumeTwoFactorPreAuthToken(
        "PREAUTH",
      ),
    ).rejects.toThrow(AuthenticationError);
    expect(store.getAndDelete).not.toHaveBeenCalled();
  });


  it("fails closed when Redis cannot save the 2FA preauth nonce", async () => {
    const store = createTokenStore();
    store.set.mockRejectedValueOnce(new Error("redis offline"));
    await expect(
      new TokenService(createRepo(), store).issueTwoFactorPreAuthToken("user-1"),
    ).rejects.toThrow(DependencyUnavailableError);
  });

  it("fails closed when Redis cannot consume a 2FA preauth nonce", async () => {
    vi.mocked(verifyToken).mockReturnValue({
      ...validAccessClaims(),
      tokenType: "preauth",
      aud: "triad:preauth",
      purpose: "2fa",
    });
    const store = createTokenStore();
    store.getAndDelete.mockRejectedValueOnce(new Error("redis offline"));
    await expect(
      new TokenService(createRepo(), store).consumeTwoFactorPreAuthToken("PREAUTH"),
    ).rejects.toThrow(DependencyUnavailableError);
  });

  it("uses only a hash of jti as revocation key, never the raw token", async () => {
    vi.mocked(verifyToken).mockReturnValue(validAccessClaims());
    const store = createTokenStore();
    const service = new TokenService(createRepo(), store);
    await service.blacklistAccessToken("RAW.SENSITIVE.JWT");
    expect(store.set).toHaveBeenCalledWith(
      hashedRevocationKey(),
      "1",
      expect.any(Number),
    );
    const ttl = vi.mocked(store.set).mock.calls[0][2];
    expect(ttl).toBeGreaterThan(290);
    expect(ttl).toBeLessThanOrEqual(300);
    await expect(
      service.isAccessTokenRevoked("RAW.SENSITIVE.JWT"),
    ).resolves.toBe(false);
    expect(store.get).toHaveBeenCalledWith(hashedRevocationKey());
    expect(hashedRevocationKey()).not.toContain("RAW.SENSITIVE.JWT");
  });

  it("detects blacklisted token", async () => {
    vi.mocked(verifyToken).mockReturnValue(validAccessClaims());
    const store = createTokenStore();
    store.get.mockResolvedValueOnce("1");
    await expect(
      new TokenService(createRepo(), store).isAccessTokenRevoked("ACCESS"),
    ).resolves.toBe(true);
  });

  it("rejects malformed JWT before reading the blacklist", async () => {
    vi.mocked(verifyToken).mockImplementation(() => {
      throw new Error("jwt malformed");
    });
    const store = createTokenStore();
    await expect(
      new TokenService(createRepo(), store).isAccessTokenRevoked("broken"),
    ).rejects.toThrow(AuthenticationError);
    expect(store.get).not.toHaveBeenCalled();
  });

  it("rejects expired access token without persisting revocation", async () => {
    vi.mocked(verifyToken).mockImplementation(() => {
      throw new Error("jwt expired");
    });
    const store = createTokenStore();
    await expect(
      new TokenService(createRepo(), store).blacklistAccessToken("expired"),
    ).rejects.toThrow(AuthenticationError);
    expect(store.set).not.toHaveBeenCalled();
  });

  it("fails closed on Redis read failure", async () => {
    vi.mocked(verifyToken).mockReturnValue(validAccessClaims());
    const store = createTokenStore();
    store.get.mockRejectedValueOnce(new Error("redis offline"));
    await expect(
      new TokenService(createRepo(), store).isAccessTokenRevoked("ACCESS"),
    ).rejects.toThrow(DependencyUnavailableError);
  });

  it("fails closed on Redis write failure during logout", async () => {
    vi.mocked(verifyToken).mockReturnValue(validAccessClaims());
    const store = createTokenStore();
    store.set.mockRejectedValueOnce(new Error("redis offline"));
    await expect(
      new TokenService(createRepo(), store).blacklistAccessToken("ACCESS"),
    ).rejects.toThrow(DependencyUnavailableError);
  });
});
