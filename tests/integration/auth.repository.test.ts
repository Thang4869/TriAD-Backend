import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import prisma from "@core/database/prisma";
import { PrismaAuthRepository } from "@modules/auth/infrastructure/repositories/prisma-auth.repository";
import { RegistrationVerificationHandler } from "@modules/auth/event-handlers/registration-verification.handler";
import { deserializeOutboxEvent } from "@core/outbox/outbox-event-schema";
import type { UserRegisteredEvent } from "@shared/domain/events/user-events";
import type { TokenStorePort } from "@modules/auth/application/ports/token-store.port";
import type { EmailService } from "@shared/services/email.service";

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

  it("createUser ghi cart và UserRegistered vào outbox trong cùng transaction", async () => {
    const user = await repository.createUser({
      email: `auth-repo-cart-${Date.now()}@test.com`,
      password: "h",
      firstName: "A",
      lastName: "B",
    });

    const [cart, events] = await Promise.all([
      prisma.cart.findUnique({ where: { userId: user.id } }),
      prisma.outboxEvent.findMany({
        where: { eventName: "UserRegistered", aggregateId: user.id },
      }),
    ]);
    expect(cart).not.toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      schemaVersion: 1,
      eventName: "UserRegistered",
      aggregateId: user.id,
    });
    expect(events[0].publishedAt).toBeNull();
  });

  it("replays a committed registration event after an email queue failure", async () => {
    const email = `durable-verification-${randomUUID()}@test.com`;
    const user = await repository.createUser({
      email,
      password: "hashed",
      firstName: "A",
      lastName: "B",
    });
    const outbox = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: user.id, eventName: "UserRegistered" },
    });
    const event = deserializeOutboxEvent(outbox.payload, {
      eventName: outbox.eventName,
      aggregateId: outbox.aggregateId,
    }) as UserRegisteredEvent;

    const set = vi.fn().mockResolvedValue(undefined);
    const sendVerificationEmail = vi
      .fn()
      .mockRejectedValueOnce(new Error("queue temporarily unavailable"))
      .mockResolvedValue(undefined);
    const handler = new RegistrationVerificationHandler(
      repository,
      { set } as unknown as TokenStorePort,
      { sendVerificationEmail } as unknown as EmailService,
    );

    await expect(handler.handle(event)).rejects.toThrow(
      "queue temporarily unavailable",
    );
    expect(
      await prisma.outboxEvent.findUniqueOrThrow({ where: { id: outbox.id } }),
    ).toMatchObject({ publishedAt: null });

    await expect(handler.handle(event)).resolves.toBeUndefined();
    expect(sendVerificationEmail).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledTimes(2);
    expect(vi.mocked(set).mock.calls[0][0]).toBe(
      vi.mocked(set).mock.calls[1][0],
    );
    expect(vi.mocked(sendVerificationEmail).mock.calls[0][2]).toBe(
      vi.mocked(sendVerificationEmail).mock.calls[1][2],
    );
  });

  it("skips verification email after an OAuth account is already verified", async () => {
    const user = await repository.createOAuthUser({
      email: `oauth-verification-${randomUUID()}@test.com`,
      firstName: "OAuth",
      lastName: "User",
    });
    const outbox = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: user.id, eventName: "UserRegistered" },
    });
    const event = deserializeOutboxEvent(outbox.payload, {
      eventName: outbox.eventName,
      aggregateId: outbox.aggregateId,
    }) as UserRegisteredEvent;
    const set = vi.fn();
    const sendVerificationEmail = vi.fn();
    await new RegistrationVerificationHandler(
      repository,
      { set } as unknown as TokenStorePort,
      { sendVerificationEmail } as unknown as EmailService,
    ).handle(event);

    expect(set).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
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

  it("createOAuthUser persists its outbox event atomically", async () => {
    const user = await repository.createOAuthUser({
      email: `oauth-direct-${Date.now()}@test.com`,
      firstName: "OAuth",
      lastName: "User",
    });

    expect(await prisma.cart.count({ where: { userId: user.id } })).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { eventName: "UserRegistered", aggregateId: user.id },
      }),
    ).toBe(1);
  });

  it("rolls back user and cart if the outbox write fails", async () => {
    const email = `auth-rollback-${Date.now()}@test.com`;
    const failingRepository = new PrismaAuthRepository(async () => {
      throw new Error("Simulated outbox failure");
    });

    await expect(
      failingRepository.createUser({
        email,
        password: "hashed",
        firstName: "A",
        lastName: "B",
      }),
    ).rejects.toThrow("Simulated outbox failure");

    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    expect(
      await prisma.outboxEvent.count({
        where: { eventName: "UserRegistered" },
      }),
    ).toBe(0);
  });

  it("persists OAuth registration once and does not duplicate on repeat", async () => {
    const identity = {
      provider: "GOOGLE" as const,
      subject: `oauth-registration-${Date.now()}`,
      email: `oauth-registration-${Date.now()}@example.com`,
      emailVerified: true,
      firstName: "OAuth",
      lastName: "User",
    };
    const created = await repository.resolveOAuthIdentity(identity);
    const again = await repository.resolveOAuthIdentity(identity);

    expect(created.created).toBe(true);
    expect(again.created).toBe(false);
    expect(created.user.id).toBe(again.user.id);
    expect(
      await prisma.cart.count({ where: { userId: created.user.id } }),
    ).toBe(1);
    const events = await prisma.outboxEvent.findMany({
      where: { eventName: "UserRegistered", aggregateId: created.user.id },
    });
    expect(events).toHaveLength(1);
  });

  it("rolls back an OAuth registration when the outbox fails", async () => {
    const email = `oauth-rollback-${Date.now()}@test.com`;
    const failingRepository = new PrismaAuthRepository(async () => {
      throw new Error("Simulated outbox failure");
    });

    await expect(
      failingRepository.resolveOAuthIdentity({
        provider: "GOOGLE",
        subject: `oauth-rollback-${Date.now()}`,
        email,
        emailVerified: true,
        firstName: "OAuth",
        lastName: "User",
      }),
    ).rejects.toThrow("Simulated outbox failure");

    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
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

    it("chỉ cho đúng một request atomically revoke cùng refresh token", async () => {
      const created = await repository.createRefreshToken(
        `rt-race-${Date.now()}`,
        userId,
        `family-race-${Date.now()}`,
        new Date(Date.now() + 100_000),
      );

      const results = await Promise.all([
        repository.revokeRefreshToken(created.id),
        repository.revokeRefreshToken(created.id),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      expect(results.filter((result) => !result)).toHaveLength(1);

      const persisted = await prisma.refreshToken.findUnique({
        where: { id: created.id },
      });

      expect(persisted?.revokedAt).not.toBeNull();
    });

    it("rolls back revocation when creating the rotated refresh token fails", async () => {
      const familyId = `family-rotate-rollback-${Date.now()}`;
      const originalToken = `rt-original-${Date.now()}`;

      const current = await repository.createRefreshToken(
        originalToken,
        userId,
        familyId,
        new Date(Date.now() + 100_000),
      );

      const duplicateToken = `rt-duplicate-${Date.now()}`;

      await repository.createRefreshToken(
        duplicateToken,
        userId,
        `other-family-${Date.now()}`,
        new Date(Date.now() + 100_000),
      );

      await expect(
        repository.rotateRefreshToken(
          current.id,
          duplicateToken,
          userId,
          familyId,
          new Date(Date.now() + 100_000),
        ),
      ).rejects.toThrow();

      const persisted = await prisma.refreshToken.findUnique({
        where: { id: current.id },
      });

      expect(persisted?.revokedAt).toBeNull();
    });
  });

  describe("OAuth identity resolution", () => {
    it("creates one verified user, cart, and OAuth account", async () => {
      const email = `oauth-new-${Date.now()}@test.com`;
      const subject = `google-${Date.now()}`;
      const result = await repository.resolveOAuthIdentity({
        provider: "GOOGLE",
        subject,
        email,
        emailVerified: true,
        firstName: "Google",
        lastName: "User",
      });

      expect(result.created).toBe(true);
      expect(result.user.isVerified).toBe(true);
      await expect(
        prisma.cart.findUnique({ where: { userId: result.user.id } }),
      ).resolves.not.toBeNull();
      await expect(
        prisma.oAuthAccount.findUnique({
          where: {
            provider_providerSubject: {
              provider: "GOOGLE",
              providerSubject: subject,
            },
          },
        }),
      ).resolves.toMatchObject({ userId: result.user.id });
    });

    it("links a verified provider identity to an existing user", async () => {
      const email = `oauth-link-${Date.now()}@test.com`;
      const user = await repository.createUser({
        email,
        password: "h",
        firstName: "Local",
        lastName: "User",
      });
      const subject = `google-link-${Date.now()}`;

      const result = await repository.resolveOAuthIdentity({
        provider: "GOOGLE",
        subject,
        email,
        emailVerified: true,
        firstName: "Google",
        lastName: "User",
      });

      expect(result.created).toBe(false);
      expect(result.user.id).toBe(user.id);
      await expect(
        prisma.oAuthAccount.findUnique({
          where: {
            provider_providerSubject: {
              provider: "GOOGLE",
              providerSubject: subject,
            },
          },
        }),
      ).resolves.toMatchObject({ userId: user.id });
    });

    it("rejects an unverified provider from linking an existing user", async () => {
      const email = `oauth-untrusted-${Date.now()}@test.com`;
      await repository.createUser({
        email,
        password: "h",
        firstName: "Local",
        lastName: "User",
      });

      await expect(
        repository.resolveOAuthIdentity({
          provider: "FACEBOOK",
          subject: `facebook-${Date.now()}`,
          email,
          emailVerified: false,
          firstName: "Facebook",
          lastName: "User",
        }),
      ).rejects.toThrow("OAuth identity email verification is required");
    });

    it("handles concurrent callbacks for one provider subject", async () => {
      const suffix = Date.now();
      const identity = {
        provider: "GOOGLE" as const,
        subject: `google-race-${suffix}`,
        email: `oauth-race-${suffix}@test.com`,
        emailVerified: true,
        firstName: "Google",
        lastName: "Race",
      };

      const results = await Promise.all([
        repository.resolveOAuthIdentity(identity),
        repository.resolveOAuthIdentity(identity),
      ]);

      expect(new Set(results.map((result) => result.user.id)).size).toBe(1);
      expect(
        await prisma.oAuthAccount.count({
          where: {
            provider: identity.provider,
            providerSubject: identity.subject,
          },
        }),
      ).toBe(1);
      expect(
        await prisma.user.count({ where: { email: identity.email } }),
      ).toBe(1);
    });
  });
});
