import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaUsersRepository } from "@modules/users/infrastructure/repositories/prisma-users.repository";

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
}));

vi.mock("@core/database/prisma", () => ({
  default: { user: mocks.user },
}));

const profile = {
  id: "user-1",
  email: "user@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  phone: null,
  role: "USER",
  isVerified: true,
  is2FAEnabled: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

describe("PrismaUsersRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.findUnique.mockResolvedValue(null);
    mocks.user.update.mockResolvedValue(profile);
  });

  it("finds a user profile with only public profile fields", async () => {
    mocks.user.findUnique.mockResolvedValue(profile);

    await expect(
      new PrismaUsersRepository().findProfileById("user-1"),
    ).resolves.toEqual(profile);

    expect(mocks.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isVerified: true,
        is2FAEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("returns null when the requested profile does not exist", async () => {
    await expect(
      new PrismaUsersRepository().findProfileById("missing"),
    ).resolves.toBeNull();
  });

  it("finds the password record without selecting unrelated fields", async () => {
    mocks.user.findUnique.mockResolvedValue({
      id: "user-1",
      password: "$argon2id$hash",
    });

    await expect(
      new PrismaUsersRepository().findById("user-1"),
    ).resolves.toEqual({ id: "user-1", password: "$argon2id$hash" });

    expect(mocks.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { id: true, password: true },
    });
  });

  it("returns null when a password record is missing", async () => {
    await expect(
      new PrismaUsersRepository().findById("missing"),
    ).resolves.toBeNull();
  });

  it("updates profile fields and returns the selected profile", async () => {
    const data = { firstName: "Grace", lastName: "Hopper", phone: "123456" };
    const updated = { ...profile, ...data };
    mocks.user.update.mockResolvedValue(updated);

    await expect(
      new PrismaUsersRepository().updateProfile("user-1", data),
    ).resolves.toEqual(updated);

    expect(mocks.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isVerified: true,
        is2FAEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("updates the password hash without returning user data", async () => {
    mocks.user.update.mockResolvedValue(profile);

    await expect(
      new PrismaUsersRepository().updatePassword("user-1", "$argon2id$new"),
    ).resolves.toBeUndefined();

    expect(mocks.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { password: "$argon2id$new" },
    });
  });
});
