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
        "family-id",
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
        "family-id",
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
        "family-id",
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
        "family-id",
        new Date(Date.now() + 100000),
      );
      await repository.createRefreshToken(
        `rt-b-${Date.now()}`,
        otherUser.id,
        "family-id",
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

    it("findRefreshTokenByFamily trả về bản ghi mới nhất trong family theo userId", async () => {
      const familyId = `family-${Date.now()}`;
      const older = await repository.createRefreshToken(
        `rt-old-${Date.now()}`,
        userId,
        familyId,
        new Date(Date.now() + 100000),
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
      const newer = await repository.createRefreshToken(
        `rt-new-${Date.now()}`,
        userId,
        familyId,
        new Date(Date.now() + 100000),
      );

      const found = await repository.findRefreshTokenByFamily(familyId, userId);

      expect(found?.id).toBe(newer.id);
      expect(found?.id).not.toBe(older.id);
    });

    it("findRefreshTokenByFamily trả về null nếu không có token nào trong family", async () => {
      const found = await repository.findRefreshTokenByFamily(
        `no-such-family-${Date.now()}`,
        userId,
      );

      expect(found).toBeNull();
    });

    it("findRefreshTokenByToken trả về đúng bản ghi theo token, null nếu không có", async () => {
      const token = `rt-by-token-${Date.now()}`;
      const created = await repository.createRefreshToken(
        token,
        userId,
        "family-id",
        new Date(Date.now() + 100000),
      );

      await expect(
        repository.findRefreshTokenByToken(token),
      ).resolves.toMatchObject({ id: created.id });
      await expect(
        repository.findRefreshTokenByToken(`nonexistent-${Date.now()}`),
      ).resolves.toBeNull();
    });

    it("findRefreshTokenByFamilyAndToken trả về đúng bản ghi khớp cả familyId lẫn token", async () => {
      const familyId = `family-fat-${Date.now()}`;
      const token = `rt-fat-${Date.now()}`;
      const created = await repository.createRefreshToken(
        token,
        userId,
        familyId,
        new Date(Date.now() + 100000),
      );

      await expect(
        repository.findRefreshTokenByFamilyAndToken(familyId, token),
      ).resolves.toMatchObject({ id: created.id });
      await expect(
        repository.findRefreshTokenByFamilyAndToken("wrong-family", token),
      ).resolves.toBeNull();
    });

    it("findActiveRefreshTokenByFamily chỉ trả về token chưa revoke và chưa hết hạn", async () => {
      const familyId = `family-active-${Date.now()}`;
      const created = await repository.createRefreshToken(
        `rt-active-${Date.now()}`,
        userId,
        familyId,
        new Date(Date.now() + 100000),
      );

      const found = await repository.findActiveRefreshTokenByFamily(familyId);
      expect(found?.id).toBe(created.id);

      await repository.revokeRefreshToken(created.id);

      await expect(
        repository.findActiveRefreshTokenByFamily(familyId),
      ).resolves.toBeNull();
    });

    it("revokeRefreshToken đánh dấu revokedAt cho đúng bản ghi theo id", async () => {
      const created = await repository.createRefreshToken(
        `rt-revoke-${Date.now()}`,
        userId,
        "family-id",
        new Date(Date.now() + 100000),
      );
      expect(created.revokedAt).toBeNull();

      await repository.revokeRefreshToken(created.id);

      const updated = await prisma.refreshToken.findUnique({
        where: { id: created.id },
      });
      expect(updated?.revokedAt).not.toBeNull();
    });

    it("revokeAllTokensInFamily đánh dấu revokedAt cho mọi token trong family, không ảnh hưởng family khác", async () => {
      const familyId = `family-revoke-all-${Date.now()}`;
      const otherFamilyId = `family-other-${Date.now()}`;
      const a = await repository.createRefreshToken(
        `rt-fam-a-${Date.now()}`,
        userId,
        familyId,
        new Date(Date.now() + 100000),
      );
      const b = await repository.createRefreshToken(
        `rt-fam-b-${Date.now()}`,
        userId,
        familyId,
        new Date(Date.now() + 100000),
      );
      const other = await repository.createRefreshToken(
        `rt-fam-other-${Date.now()}`,
        userId,
        otherFamilyId,
        new Date(Date.now() + 100000),
      );

      await repository.revokeAllTokensInFamily(familyId);

      const [ra, rb, rOther] = await Promise.all([
        prisma.refreshToken.findUnique({ where: { id: a.id } }),
        prisma.refreshToken.findUnique({ where: { id: b.id } }),
        prisma.refreshToken.findUnique({ where: { id: other.id } }),
      ]);
      expect(ra?.revokedAt).not.toBeNull();
      expect(rb?.revokedAt).not.toBeNull();
      expect(rOther?.revokedAt).toBeNull();
    });
  });
});
