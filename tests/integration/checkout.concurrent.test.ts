import { describe, expect, it } from "vitest";

import prisma from "@core/database/prisma";
import { PrismaCheckoutUnitOfWork } from "@modules/checkout/infrastructure/prisma-checkout-unit-of-work";
import { ConflictError } from "@shared/utils/errors";

describe("Checkout transaction contention (integration, real DB)", () => {
  const unitOfWork = new PrismaCheckoutUnitOfWork();

  it("translates a real SERIALIZABLE write conflict into ConflictError", async () => {
    const suffix = `${Date.now()}-${Math.random()}`;

    const discount = await prisma.discount.create({
      data: {
        code: `CONTENTION-${suffix}`,
        isActive: true,
        expiresAt: null,
        minOrderAmount: null,
        maxUses: null,
        usedCount: 0,
        type: "FIXED",
        value: 10,
      },
    });

    let bothTransactionsHaveRead = 0;

    let releaseReads!: () => void;

    const readsCompleted = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });

    const waitUntilBothHaveRead = async (): Promise<void> => {
      bothTransactionsHaveRead += 1;

      if (bothTransactionsHaveRead === 2) {
        releaseReads();
      }

      await readsCompleted;
    };

    const competingWrite = () =>
      unitOfWork.run(async (tx) => {
        const current = await tx.findDiscountByCode(discount.code);

        expect(current).not.toBeNull();

        await waitUntilBothHaveRead();

        return tx.incrementDiscountUsage(discount.id, null);
      });

    const results = await Promise.allSettled([
      competingWrite(),
      competingWrite(),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);

    expect(rejected).toHaveLength(1);

    expect(rejected[0].reason).toBeInstanceOf(ConflictError);

    const updated = await prisma.discount.findUniqueOrThrow({
      where: {
        id: discount.id,
      },
    });

    expect(updated.usedCount).toBe(1);
  });
});
