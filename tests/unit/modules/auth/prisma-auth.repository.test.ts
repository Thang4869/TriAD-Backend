import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { PrismaAuthRepository } from "@modules/auth/infrastructure/repositories/prisma-auth.repository";
import { OAuthIdentityUntrustedError } from "@modules/auth/application/errors/oauth-identity.errors";

const mocks = vi.hoisted(() => {
  const tx = {
    user: { create: vi.fn(), findUnique: vi.fn() },
    oAuthAccount: { findUnique: vi.fn(), create: vi.fn() },
    refreshToken: { updateMany: vi.fn(), create: vi.fn() },
  };
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    oAuthAccount: { findUnique: vi.fn(), create: vi.fn() },
    refreshToken: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { tx, prisma };
});

vi.mock("@core/database/prisma", () => ({ default: mocks.prisma }));

const user = {
  id: "user-1",
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  isVerified: true,
};
const refreshToken = {
  id: "refresh-1",
  token: "hashed-token",
  userId: "user-1",
  familyId: "family-1",
  expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  revokedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const identity = {
  provider: "GOOGLE" as const,
  subject: "google-subject",
  email: user.email,
  emailVerified: true,
  firstName: user.firstName,
  lastName: user.lastName,
};

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

describe("PrismaAuthRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx),
    );
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.prisma.user.update.mockResolvedValue(user);
    mocks.tx.user.create.mockResolvedValue(user);
    mocks.tx.user.findUnique.mockResolvedValue(null);
    mocks.tx.oAuthAccount.findUnique.mockResolvedValue(null);
    mocks.tx.oAuthAccount.create.mockResolvedValue({});
    mocks.prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    mocks.prisma.oAuthAccount.create.mockResolvedValue({});
    mocks.prisma.refreshToken.findUnique.mockResolvedValue(refreshToken);
    mocks.prisma.refreshToken.findFirst.mockResolvedValue(refreshToken);
    mocks.prisma.refreshToken.create.mockResolvedValue(refreshToken);
    mocks.prisma.refreshToken.delete.mockResolvedValue(refreshToken);
    mocks.prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.refreshToken.create.mockResolvedValue(refreshToken);
  });

  it("finds a user by email", async () => {
    await expect(
      new PrismaAuthRepository().findUserByEmail(user.email),
    ).resolves.toEqual(user);
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: user.email },
    });
  });

  it("finds a user by id", async () => {
    await expect(
      new PrismaAuthRepository().findUserById(user.id),
    ).resolves.toEqual(user);
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: user.id },
    });
  });

  it("selects only the session identity fields", async () => {
    const session = {
      id: user.id,
      email: user.email,
      role: "USER",
      isVerified: true,
    };
    mocks.prisma.user.findUnique.mockResolvedValue(session);

    await expect(new PrismaAuthRepository().findById(user.id)).resolves.toEqual(
      session,
    );
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: user.id },
      select: { id: true, email: true, role: true, isVerified: true },
    });
  });

  it("creates a password user with an empty cart and registration event", async () => {
    const persistEvents = vi.fn().mockResolvedValue(undefined);
    const data = { email: user.email, firstName: user.firstName };

    await expect(
      new PrismaAuthRepository(persistEvents).createUser(data as never),
    ).resolves.toEqual(user);

    expect(mocks.tx.user.create).toHaveBeenCalledWith({
      data: { ...data, isVerified: false, cart: { create: {} } },
    });
    expect(persistEvents).toHaveBeenCalledWith(mocks.tx, [
      expect.objectContaining({ userId: user.id, email: user.email }),
    ]);
  });

  it("creates a verified OAuth user with an empty cart and registration event", async () => {
    const persistEvents = vi.fn().mockResolvedValue(undefined);
    const data = { email: user.email, firstName: user.firstName };

    await expect(
      new PrismaAuthRepository(persistEvents).createOAuthUser(data as never),
    ).resolves.toEqual(user);

    expect(mocks.tx.user.create).toHaveBeenCalledWith({
      data: { ...data, isVerified: true, cart: { create: {} } },
    });
    expect(persistEvents).toHaveBeenCalledWith(mocks.tx, [
      expect.objectContaining({ userId: user.id, email: user.email }),
    ]);
  });

  it("returns an already linked OAuth identity without creating a user", async () => {
    mocks.tx.oAuthAccount.findUnique.mockResolvedValue({ user });

    await expect(
      new PrismaAuthRepository().resolveOAuthIdentity(identity),
    ).resolves.toEqual({ user, created: false });

    expect(mocks.tx.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.tx.user.create).not.toHaveBeenCalled();
  });

  it("links a verified provider identity to an existing email account", async () => {
    mocks.tx.user.findUnique.mockResolvedValue(user);

    await expect(
      new PrismaAuthRepository().resolveOAuthIdentity(identity),
    ).resolves.toEqual({ user, created: false });

    expect(mocks.tx.oAuthAccount.create).toHaveBeenCalledWith({
      data: {
        userId: user.id,
        provider: identity.provider,
        providerSubject: identity.subject,
        providerEmail: identity.email,
        providerEmailVerified: true,
      },
    });
    expect(mocks.tx.user.create).not.toHaveBeenCalled();
  });

  it("recovers a concurrent OAuth link created by another transaction", async () => {
    const racedUser = { ...user, id: "user-raced" };
    const conflict = () =>
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["provider", "providerSubject"] },
      });
    mocks.tx.oAuthAccount.findUnique.mockResolvedValue(null);
    mocks.tx.user.findUnique.mockResolvedValue(user);
    mocks.tx.oAuthAccount.create.mockRejectedValueOnce(conflict());
    mocks.prisma.oAuthAccount.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ user: racedUser });
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.prisma.oAuthAccount.create.mockRejectedValueOnce(conflict());

    await expect(
      new PrismaAuthRepository().resolveOAuthIdentity(identity),
    ).resolves.toEqual({ user: racedUser, created: false });
  });

  it("rethrows a concurrent OAuth conflict when the competing link cannot be read", async () => {
    const conflict = () =>
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["provider", "providerSubject"] },
      });
    mocks.tx.oAuthAccount.findUnique.mockResolvedValue(null);
    mocks.tx.user.findUnique.mockResolvedValue(user);
    mocks.tx.oAuthAccount.create.mockRejectedValueOnce(conflict());
    mocks.prisma.oAuthAccount.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.prisma.oAuthAccount.create.mockRejectedValueOnce(conflict());

    await expect(
      new PrismaAuthRepository().resolveOAuthIdentity(identity),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("rethrows non-Prisma errors from the concurrent OAuth retry", async () => {
    const transactionConflict = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["provider", "providerSubject"] },
      },
    );
    const retryError = new Error("OAuth persistence unavailable");
    mocks.tx.oAuthAccount.findUnique.mockResolvedValue(null);
    mocks.tx.user.findUnique.mockResolvedValue(user);
    mocks.tx.oAuthAccount.create.mockRejectedValueOnce(transactionConflict);
    mocks.prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.prisma.oAuthAccount.create.mockRejectedValueOnce(retryError);

    await expect(
      new PrismaAuthRepository().resolveOAuthIdentity(identity),
    ).rejects.toBe(retryError);
  });

  it("rejects linking an unverified provider email to an existing account", async () => {
    mocks.tx.user.findUnique.mockResolvedValue(user);

    await expect(
      new PrismaAuthRepository().resolveOAuthIdentity({
        ...identity,
        emailVerified: false,
      }),
    ).rejects.toBeInstanceOf(OAuthIdentityUntrustedError);

    expect(mocks.tx.oAuthAccount.create).not.toHaveBeenCalled();
  });

  it("creates a new OAuth account and persists its registration event", async () => {
    const persistEvents = vi.fn().mockResolvedValue(undefined);

    await expect(
      new PrismaAuthRepository(persistEvents).resolveOAuthIdentity(identity),
    ).resolves.toEqual({ user, created: true });

    expect(mocks.tx.user.create).toHaveBeenCalledWith({
      data: {
        email: identity.email,
        firstName: identity.firstName,
        lastName: identity.lastName,
        isVerified: true,
        cart: { create: {} },
        oauthAccounts: {
          create: {
            provider: identity.provider,
            providerSubject: identity.subject,
            providerEmail: identity.email,
            providerEmailVerified: true,
          },
        },
      },
    });
    expect(persistEvents).toHaveBeenCalledWith(mocks.tx, [
      expect.objectContaining({ userId: user.id, email: user.email }),
    ]);
  });

  it("updates a user by id", async () => {
    const data = { firstName: "Grace" };

    await expect(
      new PrismaAuthRepository().updateUser(user.id, data as never),
    ).resolves.toEqual(user);
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data,
    });
  });

  it("finds a refresh token with its user by hashed token", async () => {
    await expect(
      new PrismaAuthRepository().findRefreshTokenWithUser("raw-token"),
    ).resolves.toEqual(refreshToken);
    expect(mocks.prisma.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { token: hash("raw-token") },
      include: { user: true },
    });
  });

  it("deletes a refresh token by id", async () => {
    await expect(
      new PrismaAuthRepository().deleteRefreshTokenById("refresh-1"),
    ).resolves.toBeUndefined();
    expect(mocks.prisma.refreshToken.delete).toHaveBeenCalledWith({
      where: { id: "refresh-1" },
    });
  });

  it("deletes refresh tokens by hashed token", async () => {
    await expect(
      new PrismaAuthRepository().deleteRefreshTokenByToken("raw-token"),
    ).resolves.toBeUndefined();
    expect(mocks.prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { token: hash("raw-token") },
    });
  });

  it("deletes every refresh token owned by a user", async () => {
    await expect(
      new PrismaAuthRepository().deleteRefreshTokensByUserId(user.id),
    ).resolves.toBeUndefined();
    expect(mocks.prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: user.id },
    });
  });

  it("finds the newest refresh token in a family for a user", async () => {
    await expect(
      new PrismaAuthRepository().findRefreshTokenByFamily("family-1", user.id),
    ).resolves.toEqual(refreshToken);
    expect(mocks.prisma.refreshToken.findFirst).toHaveBeenCalledWith({
      where: { familyId: "family-1", userId: user.id },
      orderBy: { createdAt: "desc" },
    });
  });

  it("creates a refresh token using only its SHA-256 digest", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");

    await expect(
      new PrismaAuthRepository().createRefreshToken(
        "raw-token",
        user.id,
        "family-1",
        expiresAt,
      ),
    ).resolves.toEqual(refreshToken);

    expect(mocks.prisma.refreshToken.create).toHaveBeenCalledWith({
      data: {
        token: hash("raw-token"),
        userId: user.id,
        familyId: "family-1",
        expiresAt,
      },
    });
  });

  it("finds a refresh token by its hashed token", async () => {
    await expect(
      new PrismaAuthRepository().findRefreshTokenByToken("raw-token"),
    ).resolves.toEqual(refreshToken);
    expect(mocks.prisma.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { token: hash("raw-token") },
    });
  });

  it("finds a refresh token by family and hashed token", async () => {
    await expect(
      new PrismaAuthRepository().findRefreshTokenByFamilyAndToken(
        "family-1",
        "raw-token",
      ),
    ).resolves.toEqual(refreshToken);
    expect(mocks.prisma.refreshToken.findUnique).toHaveBeenCalledWith({
      where: {
        familyId_token: { familyId: "family-1", token: hash("raw-token") },
      },
    });
  });

  it("finds only an unrevoked, unexpired token in a family", async () => {
    await expect(
      new PrismaAuthRepository().findActiveRefreshTokenByFamily("family-1"),
    ).resolves.toEqual(refreshToken);

    expect(mocks.prisma.refreshToken.findFirst).toHaveBeenCalledWith({
      where: {
        familyId: "family-1",
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns true only when one active refresh token was revoked", async () => {
    const repository = new PrismaAuthRepository();

    mocks.prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(repository.revokeRefreshToken("refresh-1")).resolves.toBe(
      true,
    );

    mocks.prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(repository.revokeRefreshToken("refresh-1")).resolves.toBe(
      false,
    );
  });

  it("rotates a refresh token atomically when the current token is active", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");

    await expect(
      new PrismaAuthRepository().rotateRefreshToken(
        "current-token",
        "next-token",
        user.id,
        "family-1",
        expiresAt,
      ),
    ).resolves.toBe(true);

    expect(mocks.tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: "current-token", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mocks.tx.refreshToken.create).toHaveBeenCalledWith({
      data: {
        token: hash("next-token"),
        userId: user.id,
        familyId: "family-1",
        expiresAt,
      },
    });
  });

  it("does not create a replacement token when the current token was already revoked", async () => {
    mocks.tx.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      new PrismaAuthRepository().rotateRefreshToken(
        "current-token",
        "next-token",
        user.id,
        "family-1",
        refreshToken.expiresAt,
      ),
    ).resolves.toBe(false);

    expect(mocks.tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it("revokes every refresh token in a family", async () => {
    await expect(
      new PrismaAuthRepository().revokeAllTokensInFamily("family-1"),
    ).resolves.toBeUndefined();
    expect(mocks.prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: "family-1" },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
