import { describe, it, expect, beforeEach } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaAuthRepository } from "@modules/auth/auth.repository";

describe("PrismaAuthRepository (integration)", () => {
  const repository = new PrismaAuthRepository();

  it("createUser tạo user với isVerified=false mặc định", async () => {
    const user = await repository.createUser({
      email: `auth-repo-${Date.now()}@test.com`,
      password: "hashed",
      firstName: "A",
      lastName: "B",
    });

    expect(user.isVerified).toBe(false);
  });

  it("findUserByEmail/findUserById trả về đúng user vừa tạo", async () => {
    const email = `auth-repo-find-${Date.now()}@test.com`;
    const created = await repository.createUser({
      email,
      password: "h",
      firstName: "A",
      lastName: "B",
    });

    await expect(repository.findUserByEmail(email)).resolves.toMatchObject({
      id: created.id,
    });
    await expect(repository.findUserById(created.id)).resolves.toMatchObject({
      email,
    });
  });

  it("createCartForUser tạo đúng 1 cart gắn với userId", async () => {
    const user = await repository.createUser({
      email: `auth-repo-cart-${Date.now()}@test.com`,
      password: "h",
      firstName: "A",
      lastName: "B",
    });

    await repository.createCartForUser(user.id);

    const cart = await prisma.cart.findUnique({ where: { userId: user.id } });
    expect(cart).not.toBeNull();
  });

  it("updateUser cập nhật đúng field truyền vào", async () => {
    const user = await repository.createUser({
      email: `auth-repo-update-${Date.now()}@test.com`,
      password: "h",
      firstName: "A",
      lastName: "B",
    });

    const updated = await repository.updateUser(user.id, { isVerified: true });

    expect(updated.isVerified).toBe(true);
  });

  describe("refresh token lifecycle", () => {
    let userId: string;

    beforeEach(async () => {
      const user = await repository.createUser({
        email: `auth-repo-rt-${Date.now()}@test.com`,
        password: "h",
        firstName: "A",
        lastName: "B",
      });
      userId = user.id;
    });

    it("createRefreshToken + findRefreshTokenWithUser trả kèm user đầy đủ", async () => {
      const token = `rt-${Date.now()}`;
      await repository.createRefreshToken(
        token,
        userId,
        new Date(Date.now() + 100000),
      );

      const record = await repository.findRefreshTokenWithUser(token);

      expect(record?.user.id).toBe(userId);
    });

    it("deleteRefreshTokenById xoá đúng bản ghi theo id", async () => {
      const token = `rt-del-${Date.now()}`;
      const created = await repository.createRefreshToken(
        token,
        userId,
        new Date(Date.now() + 100000),
      );

      await repository.deleteRefreshTokenById(created.id);

      await expect(
        repository.findRefreshTokenWithUser(token),
      ).resolves.toBeNull();
    });

    it("deleteRefreshTokenByToken xoá đúng bản ghi theo token", async () => {
      const token = `rt-del-by-token-${Date.now()}`;
      await repository.createRefreshToken(
        token,
        userId,
        new Date(Date.now() + 100000),
      );

      await repository.deleteRefreshTokenByToken(token);

      await expect(
        repository.findRefreshTokenWithUser(token),
      ).resolves.toBeNull();
    });

    it("deleteRefreshTokensByUserId xoá tất cả token của user, không ảnh hưởng user khác", async () => {
      const otherUser = await repository.createUser({
        email: `auth-repo-other-${Date.now()}@test.com`,
        password: "h",
        firstName: "C",
        lastName: "D",
      });
      await repository.createRefreshToken(
        `rt-a-${Date.now()}`,
        userId,
        new Date(Date.now() + 100000),
      );
      await repository.createRefreshToken(
        `rt-b-${Date.now()}`,
        otherUser.id,
        new Date(Date.now() + 100000),
      );

      await repository.deleteRefreshTokensByUserId(userId);

      const remaining = await prisma.refreshToken.count({ where: { userId } });
      const otherRemaining = await prisma.refreshToken.count({
        where: { userId: otherUser.id },
      });
      expect(remaining).toBe(0);
      expect(otherRemaining).toBe(1);
    });
  });
});
