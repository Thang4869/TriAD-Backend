import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    refreshToken: {
      create: vi.fn().mockResolvedValue({ id: "refresh-1" }),
    },
  },
}));

vi.mock("@core/database/prisma", () => ({ default: prismaMock }));

import { PrismaAuthRepository } from "@modules/auth/auth.repository";

describe("refresh token persistence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not persist the raw refresh JWT", async () => {
    await new PrismaAuthRepository().createRefreshToken(
      "raw-refresh-token",
      "user-1",
      "family-1",
      new Date("2030-01-01T00:00:00.000Z"),
    );

    expect(prismaMock.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        token: expect.not.stringMatching(/^raw-refresh-token$/),
      }),
    });
  });
});
