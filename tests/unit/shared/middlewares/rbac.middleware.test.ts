import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  requireRole,
  requireAdmin,
  requireUserOrAdmin,
} from "@shared/middlewares/rbac.middleware";
import { ROLES } from "@shared/types/roles";
import {
  AuthenticationError,
  AuthorizationError,
} from "@shared/errors/application-error";

function run(
  middleware: ReturnType<typeof requireRole>,
  user: unknown,
): NextFunction {
  const next = vi.fn() as NextFunction;
  middleware({ user } as Request, {} as Response, next);
  return next;
}

describe("requireRole", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cho qua khi role của user nằm trong danh sách được phép", () => {
    const next = run(requireRole(ROLES.ADMIN), { id: "u1", role: ROLES.ADMIN });

    expect(next).toHaveBeenCalledWith();
  });

  it("chặn với AuthorizationError khi role không được phép", () => {
    const next = run(requireRole(ROLES.ADMIN), { id: "u1", role: ROLES.USER });

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });

  it("chưa đăng nhập (req.user undefined) báo 'Authentication required'", () => {
    const next = run(requireRole(ROLES.ADMIN), undefined);

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(
      AuthenticationError,
    );
  });

  it("nhận nhiều role cùng lúc và cho qua nếu khớp bất kỳ role nào", () => {
    const middleware = requireRole(ROLES.USER, ROLES.ADMIN);

    expect(run(middleware, { role: ROLES.USER })).toHaveBeenCalledWith();
    expect(run(middleware, { role: ROLES.ADMIN })).toHaveBeenCalledWith();
  });

  it("gọi requireRole() không tham số thì chặn mọi user (allowlist rỗng)", () => {
    const next = run(requireRole(), { role: ROLES.ADMIN });

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });

  it("role rác/không hợp lệ bị chặn", () => {
    const next = run(requireRole(ROLES.USER), { role: "SUPERUSER" });

    expect(vi.mocked(next).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });
});

describe("requireAdmin / requireUserOrAdmin", () => {
  it("requireAdmin chỉ cho ADMIN đi qua", () => {
    expect(run(requireAdmin, { role: ROLES.ADMIN })).toHaveBeenCalledWith();
    expect(
      vi.mocked(run(requireAdmin, { role: ROLES.USER })).mock.calls[0][0],
    ).toBeInstanceOf(AuthorizationError);
  });

  it("requireUserOrAdmin cho cả USER lẫn ADMIN đi qua", () => {
    expect(
      run(requireUserOrAdmin, { role: ROLES.USER }),
    ).toHaveBeenCalledWith();
    expect(
      run(requireUserOrAdmin, { role: ROLES.ADMIN }),
    ).toHaveBeenCalledWith();
  });
});
