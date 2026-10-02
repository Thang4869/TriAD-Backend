import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { writeProductCatalogProjection } from "@core/outbox/projection-writer";

function productData(sourceVersion: number, name: string) {
  return {
    productId: "product-1",
    name,
    description: name,
    price: sourceVersion * 10,
    stock: sourceVersion,
    category: "test",
    images: [],
    slug: "product-1",
    isActive: true,
    searchText: name,
    sourceVersion,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  } as Prisma.ProductCatalogProjectionUncheckedCreateInput;
}

describe("projection writer ordering", () => {
  it("keeps the newer snapshot when a stale writer resumes later", async () => {
    let row: Prisma.ProductCatalogProjectionUncheckedCreateInput | undefined;
    let releaseOldUpdate!: () => void;
    let oldUpdateStarted!: () => void;
    const oldUpdateReady = new Promise<void>((resolve) => {
      oldUpdateStarted = resolve;
    });
    const releaseOld = new Promise<void>((resolve) => {
      releaseOldUpdate = resolve;
    });

    const db = {
      productCatalogProjection: {
        updateMany: async ({
          data,
          where,
        }: {
          data: typeof row;
          where: { sourceVersion: { lt: number } };
        }) => {
          if (where.sourceVersion.lt === 1) {
            oldUpdateStarted();
            await releaseOld;
          }
          if (!row || (row.sourceVersion ?? -1) < where.sourceVersion.lt) {
            row = { ...row, ...data } as typeof row;
            return { count: 1 };
          }
          return { count: 0 };
        },
        create: async ({ data }: { data: typeof row }) => {
          if (row) {
            throw new Prisma.PrismaClientKnownRequestError("duplicate", {
              code: "P2002",
              clientVersion: "5.22.0",
            });
          }
          row = data;
        },
        findUnique: async () =>
          row ? { sourceVersion: row.sourceVersion ?? -1 } : null,
      },
    };

    const oldWriter = writeProductCatalogProjection(
      db as never,
      productData(1, "old"),
    );
    await oldUpdateReady;

    await writeProductCatalogProjection(db as never, productData(2, "new"));
    releaseOldUpdate();
    await oldWriter;

    expect(row).toMatchObject({
      name: "new",
      price: 20,
      stock: 2,
      sourceVersion: 2,
    });
  });

  it("ignores duplicate and stale snapshots after a newer write", async () => {
    let row: Prisma.ProductCatalogProjectionUncheckedCreateInput | undefined;
    const db = {
      productCatalogProjection: {
        updateMany: async ({
          data,
          where,
        }: {
          data: typeof row;
          where: { sourceVersion: { lt: number } };
        }) => {
          if (!row || (row.sourceVersion ?? -1) < where.sourceVersion.lt) {
            row = { ...row, ...data } as typeof row;
            return { count: 1 };
          }
          return { count: 0 };
        },
        create: async ({ data }: { data: typeof row }) => {
          if (row) {
            throw new Prisma.PrismaClientKnownRequestError("duplicate", {
              code: "P2002",
              clientVersion: "5.22.0",
            });
          }
          row = data;
        },
        findUnique: async () =>
          row ? { sourceVersion: row.sourceVersion ?? -1 } : null,
      },
    };

    await writeProductCatalogProjection(db as never, productData(2, "new"));
    await writeProductCatalogProjection(
      db as never,
      productData(2, "duplicate"),
    );
    await writeProductCatalogProjection(db as never, productData(1, "stale"));

    expect(row).toMatchObject({ name: "new", sourceVersion: 2 });
  });

  it("rethrows an unrelated unique conflict", async () => {
    const uniqueConflict = new Prisma.PrismaClientKnownRequestError(
      "duplicate slug",
      { code: "P2002", clientVersion: "5.22.0" },
    );
    const db = {
      productCatalogProjection: {
        updateMany: async () => ({ count: 0 }),
        create: async () => {
          throw uniqueConflict;
        },
        findUnique: async () => null,
      },
    };

    await expect(
      writeProductCatalogProjection(
        db as never,
        productData(1, "conflicting-slug"),
      ),
    ).rejects.toBe(uniqueConflict);
  });
});
