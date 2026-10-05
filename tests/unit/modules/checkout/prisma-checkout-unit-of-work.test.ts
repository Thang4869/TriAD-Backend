import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@prisma/client";
import prisma from "@core/database/prisma";
import { PrismaCheckoutUnitOfWork } from "@modules/checkout/infrastructure/prisma-checkout-unit-of-work";
import { ConflictError } from "@shared/errors/application-error";

vi.mock("@core/database/prisma", () => ({
  default: {
    $transaction: vi.fn(),
  },
}));

describe("PrismaCheckoutUnitOfWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("translates Prisma P2034 transaction conflicts into ConflictError", async () => {
    const unitOfWork = new PrismaCheckoutUnitOfWork();

    const prismaError = new Prisma.PrismaClientKnownRequestError(
      "Transaction failed due to a write conflict",
      {
        code: "P2034",
        clientVersion: "test",
      },
    );

    vi.mocked(prisma.$transaction).mockRejectedValueOnce(prismaError);

    await expect(unitOfWork.run(async () => "ok")).rejects.toBeInstanceOf(
      ConflictError,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rethrows non-P2034 Prisma errors unchanged", async () => {
    const unitOfWork = new PrismaCheckoutUnitOfWork();

    const prismaError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "test",
      },
    );

    vi.mocked(prisma.$transaction).mockRejectedValueOnce(prismaError);

    await expect(unitOfWork.run(async () => "ok")).rejects.toBe(prismaError);
  });
});
