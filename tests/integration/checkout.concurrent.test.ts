import { describe, expect, it } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaCheckoutRepository } from "@modules/checkout/infrastructure/repositories/prisma-checkout.repository";
import { ConflictError } from "@shared/utils/errors";
import type { Prisma } from "@prisma/client";
import type { CheckoutTransaction } from "@modules/checkout/application/ports/checkout-transaction";

function toPrismaTx(tx: CheckoutTransaction): Prisma.TransactionClient {
  return tx as unknown as Prisma.TransactionClient;
}

describe("Checkout transaction contention (integration, real DB)", () => {
  const repository = new PrismaCheckoutRepository();

  it("translates a real SERIALIZABLE write conflict into ConflictError", async () => {
    const suffix = `${Date.now()}-${Math.random()}`;

    const product = await prisma.product.create({
      data: {
        name: `Contention Product ${suffix}`,
        description: "Serializable contention test",
        price: 100,
        stock: 10,
        category: "test",
        slug: `contention-${suffix}`,
        images: [],
      },
    });

    let bothTransactionsHaveRead = 0;
    let releaseReads!: () => void;

    const readsCompleted = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });

    const waitUntilBothHaveRead = async () => {
      bothTransactionsHaveRead += 1;

      if (bothTransactionsHaveRead === 2) {
        releaseReads();
      }

      await readsCompleted;
    };

    const competingWrite = (amount: number) =>
      repository.runInTransaction(async (tx) => {
        const prismaTx = toPrismaTx(tx);

        const current = await prismaTx.product.findUniqueOrThrow({
          where: { id: product.id },
          select: {
            stock: true,
            version: true,
          },
        });

        await waitUntilBothHaveRead();

        return prismaTx.product.update({
          where: { id: product.id },
          data: {
            stock: current.stock - amount,
            version: current.version + 1,
          },
        });
      });

    const results = await Promise.allSettled([
      competingWrite(1),
      competingWrite(2),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    expect(rejected[0].reason).toBeInstanceOf(ConflictError);

    const updated = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });

    expect([8, 9]).toContain(updated.stock);
    expect(updated.version).toBe(1);
  });
});
