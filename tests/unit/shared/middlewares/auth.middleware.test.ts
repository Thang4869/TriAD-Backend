import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
} from "@shared/middlewares/auth.middleware";
import type { AuthSessionUserPort } from "@modules/auth/application/ports/auth-session-user.port";
import type { TokenStorePort } from "@modules/auth/application/ports/token-store.port";
import { UnauthorizedError } from "@shared/utils/errors";

const jwtVerifySpy = vi.spyOn(jwt, "verify");

const VERIFIED_USER = {
  id: "user-1",
  email: "a@b.com",
  role: "USER",
  isVerified: true,
};

const mockedUsers: AuthSessionUserPort = {
  findById: vi.fn(),
};

const mockedTokenStore: TokenStorePort = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  getAndDelete: vi.fn(),
  setIfAbsent: vi.fn(),
};

const authMiddleware = createAuthMiddleware(mockedUsers, mockedTokenStore);

const optionalAuthMiddleware = createOptionalAuthMiddleware(
  mockedUsers,
  mockedTokenStore,
);

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    cookies: {},
    ...overrides,
  } as Request;
}

describe("authMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jwtVerifySpy.mockReset();
    process.env.JWT_ACCESS_SECRET = "test-secret";
    vi.mocked(mockedTokenStore.get).mockResolvedValue(0 as never);
    jwtVerifySpy.mockReturnValue({
      sub: "user-1",
      email: "a@b.com",
      role: "USER",
    } as never);
    vi.mocked(mockedUsers.findById).mockResolvedValue(VERIFIED_USER as never);
  });

  it("gán req.user và gọi next() khi Bearer token hợp lệ", async () => {
    const req = createReq({ headers: { authorization: "Bearer valid.token" } });
    const next = vi.fn() as NextFunction;

    await authMiddleware(req, {} as Response, next);

    expect(jwtVerifySpy).toHaveBeenCalledWith(
      "valid.token",
      expect.any(Buffer),
      { algorithms: ["HS256"] },
    );
    expect(req.user).toEqual({
      id: "user-1",
      email: "a@b.com",
      role: "USER",
    });
    expect(next).toHaveBeenCalledWith();
  });

  it("chấp nhận token lấy từ cookie accessToken khi không có header", async () => {
    const req = createReq({ cookies: { accessToken: "cookie.token" } });
    const next = vi.fn() as NextFunction;

    await authMiddleware(req, {} as Response, next);

    expect(jwtVerifySpy).toHaveBeenCalledWith(
      "cookie.token",
      expect.any(Buffer),
      { algorithms: ["HS256"] },
    );
    expect(next).toHaveBeenCalledWith();
  });

  it("header không đúng định dạng 'Bearer ' bị bỏ qua, fallback sang cookie", async () => {
    const req = createReq({
      headers: { authorization: "Basic abc" },
      cookies: { accessToken: "cookie.token" },
    });

    await authMiddleware(req, {} as Response, vi.fn());

    expect(jwtVerifySpy).toHaveBeenCalledWith(
      "cookie.token",
      expect.any(Buffer),
      { algorithms: ["HS256"] },
    );
  });

  it("không có token nào → UnauthorizedError 'No token provided'", async () => {
    const next = vi.fn() as NextFunction;

    await authMiddleware(createReq(), {} as Response, next);

    const error = vi.mocked(next).mock
      .calls[0][0] as unknown as UnauthorizedError;
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("No token provided");
  });

  it("token nằm trong blacklist Redis → 'Token revoked', không verify JWT", async () => {
    vi.mocked(mockedTokenStore.get).mockResolvedValue(1 as never);
    const next = vi.fn() as NextFunction;

    await authMiddleware(
      createReq({ headers: { authorization: "Bearer revoked.token" } }),
      {} as Response,
      next,
    );

    expect(vi.mocked(mockedTokenStore.get)).toHaveBeenCalledWith(
      "jwt:blacklist:revoked.token",
    );
    expect(jwtVerifySpy).not.toHaveBeenCalled();
    const error = vi.mocked(next).mock
      .calls[0][0] as unknown as UnauthorizedError;
    expect(error.message).toBe("Token revoked");
  });

  it("token sai chữ ký (JsonWebTokenError) được đổi thành 'Invalid token'", async () => {
    jwtVerifySpy.mockImplementation(() => {
      throw new jwt.JsonWebTokenError("invalid signature");
    });
    const next = vi.fn() as NextFunction;

    await authMiddleware(
      createReq({ headers: { authorization: "Bearer bad.token" } }),
      {} as Response,
      next,
    );

    const error = vi.mocked(next).mock
      .calls[0][0] as unknown as UnauthorizedError;
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("Invalid token");
  });

  it("user không tồn tại trong DB → Unauthorized", async () => {
    vi.mocked(mockedUsers.findById).mockResolvedValue(null as never);
    const next = vi.fn() as NextFunction;

    await authMiddleware(
      createReq({ headers: { authorization: "Bearer valid.token" } }),
      {} as Response,
      next,
    );

    const error = vi.mocked(next).mock
      .calls[0][0] as unknown as UnauthorizedError;
    expect(error.message).toBe("User not found or not verified");
  });

  it("user chưa verify email vẫn bị chặn dù token hợp lệ", async () => {
    vi.mocked(mockedUsers.findById).mockResolvedValue({
      ...VERIFIED_USER,
      isVerified: false,
    } as never);
    const next = vi.fn() as NextFunction;

    await authMiddleware(
      createReq({ headers: { authorization: "Bearer valid.token" } }),
      {} as Response,
      next,
    );

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it("lỗi hạ tầng (DB sập) được truyền nguyên vẹn cho error handler", async () => {
    const dbError = new Error("connection refused");
    vi.mocked(mockedUsers.findById).mockRejectedValue(dbError as never);
    const next = vi.fn() as NextFunction;

    await authMiddleware(
      createReq({ headers: { authorization: "Bearer valid.token" } }),
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith(dbError);
  });
});

describe("optionalAuthMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jwtVerifySpy.mockReset();
    process.env.JWT_ACCESS_SECRET = "test-secret";
    vi.mocked(mockedTokenStore.get).mockResolvedValue(0 as never);
    jwtVerifySpy.mockReturnValue({ sub: "user-1" } as never);
    vi.mocked(mockedUsers.findById).mockResolvedValue({
      id: "user-1",
      email: "a@b.com",
      role: "USER",
      isVerified: true,
    } as never);
  });

  it("gán req.user khi có token hợp lệ", async () => {
    const req = createReq({ headers: { authorization: "Bearer valid.token" } });
    const next = vi.fn() as NextFunction;

    await optionalAuthMiddleware(req, {} as Response, next);

    expect(req.user).toEqual({ id: "user-1", email: "a@b.com", role: "USER" });
    expect(next).toHaveBeenCalledWith();
  });

  it("không có header vẫn cho đi tiếp với req.user undefined (guest)", async () => {
    const req = createReq();
    const next = vi.fn() as NextFunction;

    await optionalAuthMiddleware(req, {} as Response, next);

    expect(req.user).toBeUndefined();
    expect(jwtVerifySpy).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("token hỏng không làm fail request — nuốt lỗi và đi tiếp như guest", async () => {
    jwtVerifySpy.mockImplementation(() => {
      throw new jwt.JsonWebTokenError("bad");
    });
    const req = createReq({ headers: { authorization: "Bearer bad.token" } });
    const next = vi.fn() as NextFunction;

    await optionalAuthMiddleware(req, {} as Response, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("token bị blacklist thì bỏ qua, không gán req.user", async () => {
    vi.mocked(mockedTokenStore.get).mockResolvedValue(1 as never);
    const req = createReq({
      headers: { authorization: "Bearer revoked.token" },
    });

    await optionalAuthMiddleware(req, {} as Response, vi.fn());

    expect(jwtVerifySpy).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it("user không còn tồn tại thì req.user vẫn undefined", async () => {
    vi.mocked(mockedUsers.findById).mockResolvedValue(null as never);
    const req = createReq({ headers: { authorization: "Bearer valid.token" } });

    await optionalAuthMiddleware(req, {} as Response, vi.fn());

    expect(req.user).toBeUndefined();
  });
});
