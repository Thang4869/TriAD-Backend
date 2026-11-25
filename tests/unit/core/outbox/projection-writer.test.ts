import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  writeProductCatalogProjection,
  writeOrderHistoryProjection,
} from "@core/outbox/projection-writer";

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
          if (!row || (row.sourceVersion ?? -1) >= where.sourceVersion.lt) {
            return { count: 0 };
          }

          row = { ...row, ...data } as typeof row;
          return { count: 1 };
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
          if (!row || (row.sourceVersion ?? -1) >= where.sourceVersion.lt) {
            return { count: 0 };
          }
          row = { ...row, ...data } as typeof row;
          return { count: 1 };
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

describe("projection source version validation", () => {
  const invalidVersions = [
    -1,
    0.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ];

  it.each(invalidVersions)(
    "rejects invalid product source version %s before database write",
    async (version) => {
      const updateMany = vi.fn();
      const create = vi.fn();
      const db = {
        productCatalogProjection: { updateMany, create, findUnique: vi.fn() },
      };
      await expect(
        writeProductCatalogProjection(
          db as never,
          productData(version, "invalid"),
        ),
      ).rejects.toThrow(
        "Projection source version must be a non-negative safe integer",
      );
      expect(updateMany).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );

  it.each(invalidVersions)(
    "rejects invalid order source version %s before database write",
    async (version) => {
      const updateMany = vi.fn();
      const create = vi.fn();
      const db = {
        orderHistoryProjection: { updateMany, create, findUnique: vi.fn() },
      };
      await expect(
        writeOrderHistoryProjection(
          db as never,
          {
            orderId: "order-1",
            sourceVersion: version,
          } as Prisma.OrderHistoryProjectionUncheckedCreateInput,
        ),
      ).rejects.toThrow(
        "Projection source version must be a non-negative safe integer",
      );
      expect(updateMany).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );
});

describe("projection writer conflict recovery", () => {
  const uniqueConflict = () =>
    new Prisma.PrismaClientKnownRequestError("duplicate projection", {
      code: "P2002",
      clientVersion: "5.22.0",
    });

  const orderData = (sourceVersion: number | undefined) =>
    ({
      orderId: "order-1",
      sourceVersion,
    }) as Prisma.OrderHistoryProjectionUncheckedCreateInput;

  it("updates an order projection when the conditional update wins", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn();
    const db = {
      orderHistoryProjection: { updateMany, create, findUnique: vi.fn() },
    };

    await writeOrderHistoryProjection(db as never, orderData(2));

    expect(updateMany).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });

  it("retries an order projection update after a concurrent create wins", async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const create = vi.fn().mockRejectedValue(uniqueConflict());
    const findUnique = vi.fn();
    const db = {
      orderHistoryProjection: { updateMany, create, findUnique },
    };

    await writeOrderHistoryProjection(db as never, orderData(2));

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rethrows non-unique order projection write failures", async () => {
    const failure = new Error("database unavailable");
    const db = {
      orderHistoryProjection: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockRejectedValue(failure),
        findUnique: vi.fn(),
      },
    };

    await expect(
      writeOrderHistoryProjection(db as never, orderData(2)),
    ).rejects.toBe(failure);
  });

  it("rethrows a product conflict when no newer projection exists", async () => {
    const conflict = uniqueConflict();
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const db = {
      productCatalogProjection: {
        updateMany,
        create: vi.fn().mockRejectedValue(conflict),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    await expect(
      writeProductCatalogProjection(db as never, productData(2, "stale")),
    ).rejects.toBe(conflict);

    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it("rethrows an order conflict when the existing projection is older", async () => {
    const conflict = uniqueConflict();
    const db = {
      orderHistoryProjection: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockRejectedValue(conflict),
        findUnique: vi.fn().mockResolvedValue({ sourceVersion: 1 }),
      },
    };

    await expect(
      writeOrderHistoryProjection(db as never, orderData(2)),
    ).rejects.toBe(conflict);
  });

  it("rethrows non-unique product projection write failures", async () => {
    const failure = new Error("database unavailable");
    const db = {
      productCatalogProjection: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockRejectedValue(failure),
        findUnique: vi.fn(),
      },
    };

    await expect(
      writeProductCatalogProjection(db as never, productData(2, "new")),
    ).rejects.toBe(failure);
  });

  it("rejects missing order source versions before database writes", async () => {
    const updateMany = vi.fn();
    const create = vi.fn();
    const db = {
      orderHistoryProjection: { updateMany, create, findUnique: vi.fn() },
    };

    await expect(
      writeOrderHistoryProjection(db as never, orderData(undefined)),
    ).rejects.toThrow("Versioned projection snapshot is required");

    expect(updateMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects missing product source versions before database writes", async () => {
    const updateMany = vi.fn();
    const create = vi.fn();
    const db = {
      productCatalogProjection: { updateMany, create, findUnique: vi.fn() },
    };

    await expect(
      writeProductCatalogProjection(
        db as never,
        productData(undefined as never, "missing-version"),
      ),
    ).rejects.toThrow("Versioned projection snapshot is required");

    expect(updateMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("projection writer successful race paths", () => {
  const orderData = (sourceVersion: number) =>
    ({
      orderId: "order-1",
      sourceVersion,
    }) as Prisma.OrderHistoryProjectionUncheckedCreateInput;

  it("keeps an equal or newer order projection after a duplicate create", async () => {
    const db = {
      orderHistoryProjection: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError("duplicate", {
            code: "P2002",
            clientVersion: "5.22.0",
          }),
        ),
        findUnique: vi.fn().mockResolvedValue({ sourceVersion: 2 }),
      },
    };

    await expect(
      writeOrderHistoryProjection(db as never, orderData(2)),
    ).resolves.toBeUndefined();
  });

  it("returns when a conditional product update already applied the newer snapshot", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn();
    const db = {
      productCatalogProjection: { updateMany, create, findUnique: vi.fn() },
    };

    await writeProductCatalogProjection(db as never, productData(3, "newer"));

    expect(updateMany).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });

  it("returns when retrying the product update wins a concurrent insert", async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const db = {
      productCatalogProjection: {
        updateMany,
        create: vi.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError("duplicate", {
            code: "P2002",
            clientVersion: "5.22.0",
          }),
        ),
        findUnique: vi.fn(),
      },
    };

    await expect(
      writeProductCatalogProjection(db as never, productData(3, "newer")),
    ).resolves.toBeUndefined();

    expect(updateMany).toHaveBeenCalledTimes(2);
  });
});
