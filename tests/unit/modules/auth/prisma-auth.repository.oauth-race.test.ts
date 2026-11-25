import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { prismaMock, txMock } = vi.hoisted(() => {
  const txMock = {
    oAuthAccount: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };

  const prismaMock = {
    $transaction: vi.fn(),
    oAuthAccount: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  };

  return { prismaMock, txMock };
});

vi.mock("@core/database/prisma", () => ({ default: prismaMock }));

import { PrismaAuthRepository } from "@modules/auth/infrastructure/repositories/prisma-auth.repository";

const identity = {
  provider: "GOOGLE" as const,
  subject: "provider-subject",
  email: "person@example.com",
  emailVerified: true,
  firstName: "Test",
  lastName: "User",
};

const user = {
  id: "user-1",
  email: identity.email,
  firstName: "Test",
  lastName: "User",
  isVerified: true,
};

function uniqueConflict() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

describe("PrismaAuthRepository OAuth unique-conflict recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof txMock) => Promise<unknown>) =>
        callback(txMock),
    );
  });

  it("returns an identity linked by the concurrent transaction", async () => {
    const linked = { user, created: false };
    prismaMock.$transaction.mockRejectedValueOnce(uniqueConflict());
    prismaMock.oAuthAccount.findUnique.mockResolvedValueOnce({ user });

    await expect(
      new PrismaAuthRepository().resolveOAuthIdentity(identity),
    ).resolves.toEqual(linked);

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("links an existing verified user after the initial transaction conflicts", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(uniqueConflict());
    prismaMock.oAuthAccount.findUnique.mockResolvedValueOnce(null);
    prismaMock.user.findUnique.mockResolvedValueOnce(user);
    prismaMock.oAuthAccount.create.mockResolvedValueOnce({});

    await expect(
      new PrismaAuthRepository().resolveOAuthIdentity(identity),
    ).resolves.toEqual({ user, created: false });

    expect(prismaMock.oAuthAccount.create).toHaveBeenCalledWith({
      data: {
        userId: user.id,
        provider: identity.provider,
        providerSubject: identity.subject,
        providerEmail: identity.email,
        providerEmailVerified: true,
      },
    });
  });

  it("returns the raced OAuth link when retrying account creation also conflicts", async () => {
    const racedUser = { ...user, id: "raced-user" };
    prismaMock.$transaction.mockRejectedValueOnce(uniqueConflict());
    prismaMock.oAuthAccount.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ user: racedUser });
    prismaMock.user.findUnique.mockResolvedValueOnce(user);
    prismaMock.oAuthAccount.create.mockRejectedValueOnce(uniqueConflict());

    await expect(
      new PrismaAuthRepository().resolveOAuthIdentity(identity),
    ).resolves.toEqual({ user: racedUser, created: false });
  });

  it("rethrows the retry conflict when no raced OAuth link exists", async () => {
    const retryError = uniqueConflict();
    prismaMock.$transaction.mockRejectedValueOnce(uniqueConflict());
    prismaMock.oAuthAccount.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.user.findUnique.mockResolvedValueOnce(user);
    prismaMock.oAuthAccount.create.mockRejectedValueOnce(retryError);

    await expect(
      new PrismaAuthRepository().resolveOAuthIdentity(identity),
    ).rejects.toBe(retryError);
  });

  it("does not link an existing user when the provider email is unverified", async () => {
    const originalError = uniqueConflict();
    prismaMock.$transaction.mockRejectedValueOnce(originalError);
    prismaMock.oAuthAccount.findUnique.mockResolvedValueOnce(null);
    prismaMock.user.findUnique.mockResolvedValueOnce(user);

    await expect(
      new PrismaAuthRepository().resolveOAuthIdentity({
        ...identity,
        emailVerified: false,
      }),
    ).rejects.toBe(originalError);

    expect(prismaMock.oAuthAccount.create).not.toHaveBeenCalled();
  });

  it("rethrows errors that are not Prisma unique conflicts", async () => {
    const originalError = new Error("database unavailable");
    prismaMock.$transaction.mockRejectedValueOnce(originalError);

    await expect(
      new PrismaAuthRepository().resolveOAuthIdentity(identity),
    ).rejects.toBe(originalError);

    expect(prismaMock.oAuthAccount.findUnique).not.toHaveBeenCalled();
  });
});
