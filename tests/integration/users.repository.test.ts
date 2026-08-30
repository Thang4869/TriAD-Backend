import { describe, it, expect } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaUsersRepository } from "@modules/users/users.repository";

describe("PrismaUsersRepository (integration)", () => {
  const repository = new PrismaUsersRepository();

  it("findProfileById KHÔNG trả field password (data leakage check)", async () => {
    const user = await prisma.user.create({
      data: {
        email: `users-repo-${Date.now()}@test.com`,
        password: "super-secret-hash",
        firstName: "A",
        lastName: "B",
        isVerified: true,
      },
    });

    const profile: any = await repository.findProfileById(user.id);

    expect(profile).not.toHaveProperty("password");
    expect(profile.email).toBe(user.email);
  });

  it("updateProfile cập nhật đúng field và trả về UserProfile không kèm password", async () => {
    const user = await prisma.user.create({
      data: {
        email: `users-repo-update-${Date.now()}@test.com`,
        password: "h",
        firstName: "Old",
        lastName: "Name",
        isVerified: true,
      },
    });

    const updated: any = await repository.updateProfile(user.id, {
      firstName: "New",
    });

    expect(updated.firstName).toBe("New");
    expect(updated).not.toHaveProperty("password");
  });

  it("updatePassword thay đổi đúng password trong DB", async () => {
    const user = await prisma.user.create({
      data: {
        email: `users-repo-pw-${Date.now()}@test.com`,
        password: "old-hash",
        firstName: "A",
        lastName: "B",
        isVerified: true,
      },
    });

    await repository.updatePassword(user.id, "new-hash");

    const raw = await prisma.user.findUnique({ where: { id: user.id } });
    expect(raw?.password).toBe("new-hash");
  });

  it("findById returns full user including password", async () => {
    const user = await prisma.user.create({
      data: {
        email: `users-repo-find-${Date.now()}@test.com`,
        password: "secret-hash",
        firstName: "A",
        lastName: "B",
        isVerified: true,
      },
    });
    const found = await repository.findById(user.id);
    expect(found).toHaveProperty("password", "secret-hash");
  });
});
