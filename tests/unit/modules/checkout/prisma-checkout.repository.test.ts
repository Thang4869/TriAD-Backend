import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import prisma from "@core/database/prisma";
import { PrismaCheckoutRepository } from "@modules/checkout/infrastructure/repositories/prisma-checkout.repository";
import { ConflictError } from "@shared/utils/errors";

vi.mock("@core/database/prisma", () => ({
  default: {
    $transaction: vi.fn(),
  },
}));

describe("PrismaCheckoutRepository", () => {
  it("translates Prisma P2034 transaction conflicts into ConflictError", async () => {
    const repository = new PrismaCheckoutRepository();

    const prismaError = new Prisma.PrismaClientKnownRequestError(
      "Transaction failed due to a write conflict",
      {
        code: "P2034",
        clientVersion: "test",
      },
    );

    vi.mocked(prisma.$transaction).mockRejectedValueOnce(prismaError);

    await expect(
      repository.runInTransaction(async () => "ok"),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rethrows non-P2034 Prisma errors unchanged", async () => {
    const repository = new PrismaCheckoutRepository();

    const prismaError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "test",
      },
    );

    vi.mocked(prisma.$transaction).mockRejectedValueOnce(prismaError);

    await expect(repository.runInTransaction(async () => "ok")).rejects.toBe(
      prismaError,
    );
  });
});
