import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { UsersController } from "@modules/users/users.controller";
import type { IUsersService } from "@modules/users/users.service";

function resMock() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function reqMock(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    body: {},
    user: { id: "u1" },
    ...overrides,
  } as unknown as Request;
}

describe("UsersController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the authenticated user's profile", async () => {
    const profile = { id: "u1", firstName: "Test" };
    const service = {
      getProfile: vi.fn().mockResolvedValue(profile),
    } as unknown as IUsersService;
    const res = resMock();

    await new UsersController(service).getProfile(reqMock(), res, vi.fn());

    expect(service.getProfile).toHaveBeenCalledWith("u1");
    expect(res.json).toHaveBeenCalledWith({ success: true, data: profile });
  });

  it("updates only the submitted profile fields for the authenticated user", async () => {
    const data = { firstName: "New", lastName: "Name", phone: "0123456789" };
    const updated = { id: "u1", ...data };
    const service = {
      updateProfile: vi.fn().mockResolvedValue(updated),
    } as unknown as IUsersService;
    const res = resMock();

    await new UsersController(service).updateProfile(
      reqMock({ body: data }),
      res,
      vi.fn(),
    );

    expect(service.updateProfile).toHaveBeenCalledWith("u1", data);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: updated });
  });

  it.each([
    [{ currentPassword: "", newPassword: "new-secret" }],
    [{ currentPassword: "old-secret", newPassword: "" }],
    [{}],
  ])("rejects incomplete password changes", async (body) => {
    const service = { changePassword: vi.fn() } as unknown as IUsersService;
    const next = vi.fn();

    await new UsersController(service).changePassword(
      reqMock({ body }),
      resMock(),
      next,
    );

    expect(service.changePassword).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "currentPassword and newPassword are required",
      }),
    );
  });

  it("changes the authenticated user's password", async () => {
    const service = {
      changePassword: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as IUsersService;
    const res = resMock();

    await new UsersController(service).changePassword(
      reqMock({
        body: {
          currentPassword: "old-secret",
          newPassword: "new-secret",
        },
      }),
      res,
      vi.fn(),
    );

    expect(service.changePassword).toHaveBeenCalledWith(
      "u1",
      "old-secret",
      "new-secret",
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Password changed successfully",
    });
  });
});
