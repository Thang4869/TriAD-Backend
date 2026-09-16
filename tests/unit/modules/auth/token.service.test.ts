import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TokenService } from "@modules/auth/services/token.service";
import type {
  IAuthRepository,
  RefreshTokenWithUser,
} from "@modules/auth/auth.repository";
import { UnauthorizedError } from "@shared/utils/errors";
import { signToken, verifyToken, decodeToken } from "@shared/utils/jwt";
import redis from "@core/redis/client";
import { SECURITY } from "@shared/constants/security.constant";

vi.mock("@shared/utils/jwt", () => ({
  signToken: vi.fn(),
  verifyToken: vi.fn(),
  decodeToken: vi.fn(),
}));

vi.mock("@core/redis/client", () => ({
  default: { setex: vi.fn().mockResolvedValue("OK") },
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
    createCartForUser: vi.fn(),
    updateUser: vi.fn(),
    createRefreshToken: vi.fn().mockResolvedValue({}),
    findRefreshTokenByToken: vi.fn(),
    revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
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

function tokenRecord(
  overrides: Partial<RefreshTokenWithUser> = {},
): RefreshTokenWithUser {
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
  } as RefreshTokenWithUser;
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_ACCESS_SECRET = "access-secret";
  process.env.JWT_REFRESH_SECRET = "refresh-secret";
  delete process.env.JWT_ACCESS_EXPIRY;
  delete process.env.JWT_REFRESH_EXPIRY;

  vi.mocked(signToken).mockImplementation((_p, secret) =>
    secret === "access-secret" ? "ACCESS" : "REFRESH",
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(verifyToken).mockReturnValue({ familyId: "fam-1" } as any);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("TokenService.generateTokens", () => {
  it("ký access + refresh token và lưu refresh token xuống DB", async () => {
    const repo = createRepo();
    const service = new TokenService(repo);

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
      "fam-1",
      expect.any(Date),
    );
  });

  it("dùng expiry mặc định 15m / 7d khi env không đặt", async () => {
    await new TokenService(createRepo()).generateTokens(user);

    expect(signToken).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sub: "user-1", role: "USER" }),
      "access-secret",
      "15m",
    );
    expect(signToken).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sub: "user-1" }),
      "refresh-secret",
      "7d",
    );
  });

  it("tôn trọng JWT_ACCESS_EXPIRY / JWT_REFRESH_EXPIRY từ env", async () => {
    process.env.JWT_ACCESS_EXPIRY = "5m";
    process.env.JWT_REFRESH_EXPIRY = "2d";

    await new TokenService(createRepo()).generateTokens(user);

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
    await new TokenService(createRepo()).generateTokens(user, "fam-existing");

    expect(signToken).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ familyId: "fam-existing" }),
      "refresh-secret",
      "7d",
    );
  });

  it("sinh familyId mới khi không truyền", async () => {
    await new TokenService(createRepo()).generateTokens(user);

    const payload = vi.mocked(signToken).mock.calls[1][0] as {
      familyId: string;
    };
    expect(payload.familyId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("ép is2FAEnabled về false khi giá trị là null/undefined", async () => {
    const result = await new TokenService(createRepo()).generateTokens({
      ...user,
      is2FAEnabled: null,
    });
    expect(result.user.is2FAEnabled).toBe(false);
  });

  it("ném lỗi khi thiếu JWT_ACCESS_SECRET", async () => {
    delete process.env.JWT_ACCESS_SECRET;
    await expect(
      new TokenService(createRepo()).generateTokens(user),
    ).rejects.toThrow("JWT_ACCESS_SECRET is not defined");
  });

  it("ném lỗi khi thiếu JWT_REFRESH_SECRET", async () => {
    delete process.env.JWT_REFRESH_SECRET;
    await expect(
      new TokenService(createRepo()).generateTokens(user),
    ).rejects.toThrow("JWT_REFRESH_SECRET is not defined");
  });
});

describe("TokenService.refreshToken", () => {
  beforeEach(() => {
    vi.mocked(verifyToken).mockReturnValue({
      sub: "user-1",
      familyId: "fam-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  it("xoay token thành công: revoke token cũ và cấp cặp token mới", async () => {
    const repo = createRepo({
      findRefreshTokenWithUser: vi.fn().mockResolvedValue(tokenRecord()),
    });

    const result = await new TokenService(repo).refreshToken("refresh-token");

    expect(repo.revokeRefreshToken).toHaveBeenCalledWith("rt-1");
    expect(result.accessToken).toBe("ACCESS");
    expect(repo.createRefreshToken).toHaveBeenCalled();
  });

  it("từ chối khi token không có trong DB", async () => {
    const repo = createRepo();
    await expect(
      new TokenService(repo).refreshToken("khong-co"),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("phát hiện reuse: token đã revoke thì huỷ cả family", async () => {
    const repo = createRepo({
      findRefreshTokenWithUser: vi
        .fn()
        .mockResolvedValue(tokenRecord({ revokedAt: new Date() })),
    });

    await expect(
      new TokenService(repo).refreshToken("refresh-token"),
    ).rejects.toThrow(/theft/i);
    expect(repo.revokeAllTokensInFamily).toHaveBeenCalledWith("fam-1");
  });

  it("từ chối token đã hết hạn", async () => {
    const repo = createRepo({
      findRefreshTokenWithUser: vi
        .fn()
        .mockResolvedValue(
          tokenRecord({ expiresAt: new Date(Date.now() - 1_000) }),
        ),
    });

    await expect(
      new TokenService(repo).refreshToken("refresh-token"),
    ).rejects.toThrow(/expired/i);
  });

  it("từ chối khi familyId trong JWT lệch với DB", async () => {
    const repo = createRepo({
      findRefreshTokenWithUser: vi
        .fn()
        .mockResolvedValue(tokenRecord({ familyId: "fam-khac" })),
    });

    await expect(
      new TokenService(repo).refreshToken("refresh-token"),
    ).rejects.toThrow(/Family ID mismatch/);
  });

  it("từ chối khi userId trong JWT lệch với DB", async () => {
    const repo = createRepo({
      findRefreshTokenWithUser: vi
        .fn()
        .mockResolvedValue(tokenRecord({ userId: "user-khac" })),
    });

    await expect(
      new TokenService(repo).refreshToken("refresh-token"),
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
      new TokenService(repo).refreshToken("refresh-token"),
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
      new TokenService(repo).refreshToken("refresh-token"),
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
      new TokenService(repo).refreshToken("refresh-token"),
    ).resolves.toBeDefined();
  });

  it("gói mọi lỗi lạ thành UnauthorizedError", async () => {
    vi.mocked(verifyToken).mockImplementation(() => {
      throw new Error("jwt malformed");
    });

    await expect(
      new TokenService(createRepo()).refreshToken("rác"),
    ).rejects.toThrow(UnauthorizedError);
  });
});

describe("TokenService.invalidateAllUserTokens", () => {
  it("xoá toàn bộ refresh token của user", async () => {
    const repo = createRepo();
    await new TokenService(repo).invalidateAllUserTokens("user-1");
    expect(repo.deleteRefreshTokensByUserId).toHaveBeenCalledWith("user-1");
  });
});

describe("TokenService.blacklistAccessToken", () => {
  it("ghi token vào redis với TTL còn lại", async () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(decodeToken).mockReturnValue({ exp } as any);

    await new TokenService(createRepo()).blacklistAccessToken("ACCESS");

    expect(redis.setex).toHaveBeenCalledWith(
      `${SECURITY.BLACKLIST_KEY_PREFIX}ACCESS`,
      expect.any(Number),
      "1",
    );
    const ttl = vi.mocked(redis.setex).mock.calls[0][1] as number;
    expect(ttl).toBeGreaterThan(290);
    expect(ttl).toBeLessThanOrEqual(300);
  });

  it("bỏ qua token đã hết hạn (TTL <= 0)", async () => {
    vi.mocked(decodeToken).mockReturnValue({
      exp: Math.floor(Date.now() / 1000) - 10,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await new TokenService(createRepo()).blacklistAccessToken("ACCESS");
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it("bỏ qua token không decode được", async () => {
    vi.mocked(decodeToken).mockReturnValue(null);
    await new TokenService(createRepo()).blacklistAccessToken("rác");
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it("bỏ qua token không có claim exp", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(decodeToken).mockReturnValue({} as any);
    await new TokenService(createRepo()).blacklistAccessToken("ACCESS");
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it("nuốt lỗi redis thay vì làm hỏng luồng logout", async () => {
    vi.mocked(decodeToken).mockReturnValue({
      exp: Math.floor(Date.now() / 1000) + 300,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(redis.setex).mockRejectedValueOnce(new Error("redis down"));

    await expect(
      new TokenService(createRepo()).blacklistAccessToken("ACCESS"),
    ).resolves.toBeUndefined();
  });
});
