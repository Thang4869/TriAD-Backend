import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
} from "@shared/middlewares/auth.middleware";
import type { AuthSessionUserPort } from "@modules/auth/application/ports/auth-session-user.port";
import type { AccessTokenVerifierPort } from "@modules/auth/application/ports/access-token-verifier.port";
import { UnauthorizedError } from "@shared/utils/errors";

const VERIFIED_USER = {
  id: "user-1",
  email: "a@b.com",
  role: "USER",
  isVerified: true,
};

const mockedUsers: AuthSessionUserPort = {
  findById: vi.fn(),
};

const mockedTokenService: AccessTokenVerifierPort = {
  verifyAccessToken: vi.fn(),
  isAccessTokenRevoked: vi.fn(),
};

const authMiddleware = createAuthMiddleware(mockedUsers, mockedTokenService);

const optionalAuthMiddleware = createOptionalAuthMiddleware(
  mockedUsers,
  mockedTokenService,
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

    vi.mocked(mockedTokenService.isAccessTokenRevoked).mockResolvedValue(false);

    vi.mocked(mockedTokenService.verifyAccessToken).mockReturnValue({
      sub: "user-1",
      email: "a@b.com",
      role: "USER",
    });

    vi.mocked(mockedUsers.findById).mockResolvedValue(VERIFIED_USER as never);
  });

  it("gán req.user và gọi next() khi Bearer token hợp lệ", async () => {
    const req = createReq({
      headers: { authorization: "Bearer valid.token" },
    });
    const next = vi.fn() as NextFunction;

    await authMiddleware(req, {} as Response, next);

    expect(mockedTokenService.isAccessTokenRevoked).toHaveBeenCalledWith(
      "valid.token",
    );
    expect(mockedTokenService.verifyAccessToken).toHaveBeenCalledWith(
      "valid.token",
    );
    expect(mockedUsers.findById).toHaveBeenCalledWith("user-1");

    expect(req.user).toEqual({
      id: "user-1",
      email: "a@b.com",
      role: "USER",
    });

    expect(next).toHaveBeenCalledWith();
  });

  it("chấp nhận token từ cookie accessToken khi không có Bearer header", async () => {
    const req = createReq({
      cookies: { accessToken: "cookie.token" },
    });
    const next = vi.fn() as NextFunction;

    await authMiddleware(req, {} as Response, next);

    expect(mockedTokenService.isAccessTokenRevoked).toHaveBeenCalledWith(
      "cookie.token",
    );
    expect(mockedTokenService.verifyAccessToken).toHaveBeenCalledWith(
      "cookie.token",
    );
    expect(next).toHaveBeenCalledWith();
  });

  it("header không phải Bearer fallback sang cookie", async () => {
    const req = createReq({
      headers: { authorization: "Basic abc" },
      cookies: { accessToken: "cookie.token" },
    });

    await authMiddleware(req, {} as Response, vi.fn());

    expect(mockedTokenService.verifyAccessToken).toHaveBeenCalledWith(
      "cookie.token",
    );
  });

  it("không có token → UnauthorizedError", async () => {
    const next = vi.fn() as NextFunction;

    await authMiddleware(createReq(), {} as Response, next);

    const error = vi.mocked(next).mock
      .calls[0][0] as unknown as UnauthorizedError;

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("No token provided");

    expect(mockedTokenService.isAccessTokenRevoked).not.toHaveBeenCalled();
    expect(mockedTokenService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it("token revoked → UnauthorizedError và không verify token", async () => {
    vi.mocked(mockedTokenService.isAccessTokenRevoked).mockResolvedValue(true);

    const next = vi.fn() as NextFunction;

    await authMiddleware(
      createReq({
        headers: { authorization: "Bearer revoked.token" },
      }),
      {} as Response,
      next,
    );

    expect(mockedTokenService.isAccessTokenRevoked).toHaveBeenCalledWith(
      "revoked.token",
    );
    expect(mockedTokenService.verifyAccessToken).not.toHaveBeenCalled();

    const error = vi.mocked(next).mock
      .calls[0][0] as unknown as UnauthorizedError;

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("Token revoked");
  });

  it("token không hợp lệ → truyền UnauthorizedError từ TokenService", async () => {
    const error = new UnauthorizedError("Invalid token");

    vi.mocked(mockedTokenService.verifyAccessToken).mockImplementation(() => {
      throw error;
    });

    const next = vi.fn() as NextFunction;

    await authMiddleware(
      createReq({
        headers: { authorization: "Bearer bad.token" },
      }),
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith(error);
  });

  it("user không tồn tại → UnauthorizedError", async () => {
    vi.mocked(mockedUsers.findById).mockResolvedValue(null);

    const next = vi.fn() as NextFunction;

    await authMiddleware(
      createReq({
        headers: { authorization: "Bearer valid.token" },
      }),
      {} as Response,
      next,
    );

    const error = vi.mocked(next).mock
      .calls[0][0] as unknown as UnauthorizedError;

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("User not found or not verified");
  });

  it("user chưa verify email → UnauthorizedError", async () => {
    vi.mocked(mockedUsers.findById).mockResolvedValue({
      ...VERIFIED_USER,
      isVerified: false,
    } as never);

    const next = vi.fn() as NextFunction;

    await authMiddleware(
      createReq({
        headers: { authorization: "Bearer valid.token" },
      }),
      {} as Response,
      next,
    );

    const error = vi.mocked(next).mock
      .calls[0][0] as unknown as UnauthorizedError;

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("User not found or not verified");
  });

  it("lỗi hạ tầng được truyền nguyên vẹn cho error handler", async () => {
    const dbError = new Error("connection refused");

    vi.mocked(mockedUsers.findById).mockRejectedValue(dbError);

    const next = vi.fn() as NextFunction;

    await authMiddleware(
      createReq({
        headers: { authorization: "Bearer valid.token" },
      }),
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith(dbError);
  });
});

describe("optionalAuthMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(mockedTokenService.isAccessTokenRevoked).mockResolvedValue(false);

    vi.mocked(mockedTokenService.verifyAccessToken).mockReturnValue({
      sub: "user-1",
      email: "a@b.com",
      role: "USER",
    });

    vi.mocked(mockedUsers.findById).mockResolvedValue(VERIFIED_USER as never);
  });

  it("gán req.user khi có token hợp lệ", async () => {
    const req = createReq({
      headers: { authorization: "Bearer valid.token" },
    });
    const next = vi.fn() as NextFunction;

    await optionalAuthMiddleware(req, {} as Response, next);

    expect(mockedTokenService.verifyAccessToken).toHaveBeenCalledWith(
      "valid.token",
    );

    expect(req.user).toEqual({
      id: "user-1",
      email: "a@b.com",
      role: "USER",
    });

    expect(next).toHaveBeenCalledWith();
  });

  it("không có header → tiếp tục như guest", async () => {
    const req = createReq();
    const next = vi.fn() as NextFunction;

    await optionalAuthMiddleware(req, {} as Response, next);

    expect(req.user).toBeUndefined();
    expect(mockedTokenService.verifyAccessToken).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("token không hợp lệ → tiếp tục như guest", async () => {
    vi.mocked(mockedTokenService.verifyAccessToken).mockImplementation(() => {
      throw new UnauthorizedError("Invalid token");
    });

    const req = createReq({
      headers: { authorization: "Bearer bad.token" },
    });
    const next = vi.fn() as NextFunction;

    await optionalAuthMiddleware(req, {} as Response, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("token revoked → bỏ qua authentication", async () => {
    vi.mocked(mockedTokenService.isAccessTokenRevoked).mockResolvedValue(true);

    const req = createReq({
      headers: { authorization: "Bearer revoked.token" },
    });
    const next = vi.fn() as NextFunction;

    await optionalAuthMiddleware(req, {} as Response, next);

    expect(mockedTokenService.verifyAccessToken).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("user không tồn tại → tiếp tục như guest", async () => {
    vi.mocked(mockedUsers.findById).mockResolvedValue(null);

    const req = createReq({
      headers: { authorization: "Bearer valid.token" },
    });
    const next = vi.fn() as NextFunction;

    await optionalAuthMiddleware(req, {} as Response, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("user chưa verify → tiếp tục như guest", async () => {
    vi.mocked(mockedUsers.findById).mockResolvedValue({
      ...VERIFIED_USER,
      isVerified: false,
    } as never);

    const req = createReq({
      headers: { authorization: "Bearer valid.token" },
    });
    const next = vi.fn() as NextFunction;

    await optionalAuthMiddleware(req, {} as Response, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });
});
