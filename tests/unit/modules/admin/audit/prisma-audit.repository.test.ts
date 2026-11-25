import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaAuditRepository } from "@modules/admin/audit/infrastructure/prisma-audit.repository";

const mocks = vi.hoisted(() => ({
  adminAuditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  transaction: vi.fn(),
}));

vi.mock("@core/database/prisma", () => ({
  default: {
    adminAuditLog: mocks.adminAuditLog,
    $transaction: mocks.transaction,
  },
}));

const record = {
  id: "audit-1",
  actorId: "admin-1",
  actorRole: "ADMIN",
  action: "PRODUCT_UPDATE",
  targetType: "PRODUCT",
  targetId: "product-1",
  outcome: "SUCCESS",
  requestId: "request-1",
  metadata: { changedFields: ["name"] },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("PrismaAuditRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminAuditLog.create.mockResolvedValue(record);
    mocks.adminAuditLog.findMany.mockResolvedValue([]);
    mocks.adminAuditLog.count.mockResolvedValue(0);
    mocks.transaction.mockImplementation(
      async (operations: Promise<unknown>[]) => Promise.all(operations),
    );
  });

  it("persists the complete audit event and optional metadata", async () => {
    const input = {
      actorId: "admin-1",
      actorRole: "ADMIN",
      action: "PRODUCT_UPDATE" as const,
      targetType: "PRODUCT",
      targetId: "product-1",
      requestId: "request-1",
      outcome: "SUCCESS" as const,
      metadata: { changedFields: ["name"] },
    };
    await expect(
      new PrismaAuditRepository().create(input),
    ).resolves.toBeUndefined();
    expect(mocks.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: "admin-1",
        actorRole: "ADMIN",
        action: "PRODUCT_UPDATE",
        targetType: "PRODUCT",
        targetId: "product-1",
        outcome: "SUCCESS",
        requestId: "request-1",
        metadata: { changedFields: ["name"] },
      },
    });
  });

  it("persists events without optional actor, target, or metadata", async () => {
    await new PrismaAuditRepository().create({
      actorRole: "UNKNOWN",
      action: "ADMIN_ACTION_DENIED",
      targetType: "PRODUCT",
      requestId: "request-2",
      outcome: "DENIED",
    });
    expect(mocks.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: undefined,
        actorRole: "UNKNOWN",
        action: "ADMIN_ACTION_DENIED",
        targetType: "PRODUCT",
        targetId: undefined,
        outcome: "DENIED",
        requestId: "request-2",
        metadata: undefined,
      },
    });
  });

  it("returns a paginated audit page with stable descending ordering", async () => {
    mocks.adminAuditLog.findMany.mockResolvedValue([record]);
    mocks.adminAuditLog.count.mockResolvedValue(21);
    const result = await new PrismaAuditRepository().findPage({}, 2, 10);
    expect(result).toEqual({
      records: [record],
      page: 2,
      limit: 10,
      total: 21,
      totalPages: 3,
    });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.adminAuditLog.findMany).toHaveBeenCalledWith({
      where: {
        actorId: undefined,
        action: undefined,
        targetType: undefined,
        targetId: undefined,
        outcome: undefined,
        createdAt: undefined,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 10,
      take: 10,
    });
    expect(mocks.adminAuditLog.count).toHaveBeenCalledWith({
      where: {
        actorId: undefined,
        action: undefined,
        targetType: undefined,
        targetId: undefined,
        outcome: undefined,
        createdAt: undefined,
      },
    });
  });

  it("applies all supplied filters and inclusive date bounds", async () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-01-31T23:59:59.999Z");
    await new PrismaAuditRepository().findPage(
      {
        actorId: "admin-1",
        action: "PRODUCT_UPDATE",
        targetType: "PRODUCT",
        targetId: "product-1",
        outcome: "FAILURE",
        from,
        to,
      },
      1,
      25,
    );
    expect(mocks.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          actorId: "admin-1",
          action: "PRODUCT_UPDATE",
          targetType: "PRODUCT",
          targetId: "product-1",
          outcome: "FAILURE",
          createdAt: { gte: from, lte: to },
        },
        skip: 0,
        take: 25,
      }),
    );
  });

  it("supports a lower-only or upper-only date bound", async () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-01-31T23:59:59.999Z");
    await new PrismaAuditRepository().findPage({ from }, 1, 10);
    expect(mocks.adminAuditLog.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gte: from, lte: undefined },
        }),
      }),
    );
    await new PrismaAuditRepository().findPage({ to }, 1, 10);
    expect(mocks.adminAuditLog.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gte: undefined, lte: to },
        }),
      }),
    );
  });

  it("returns zero total pages for an empty result set", async () => {
    mocks.adminAuditLog.count.mockResolvedValue(0);
    await expect(
      new PrismaAuditRepository().findPage({}, 1, 20),
    ).resolves.toMatchObject({ records: [], total: 0, totalPages: 0 });
  });

  it("propagates transaction failures instead of returning a partial page", async () => {
    mocks.transaction.mockRejectedValue(new Error("audit query failed"));
    await expect(
      new PrismaAuditRepository().findPage({}, 1, 10),
    ).rejects.toThrow("audit query failed");
  });
});
