import { beforeEach, describe, expect, it } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaAuditRepository } from "@modules/admin/audit/infrastructure/prisma-audit.repository";

describe("PrismaAuditRepository (integration)", () => {
  const repository = new PrismaAuditRepository();

  beforeEach(async () => {
    await prisma.adminAuditLog.deleteMany();
  });

  it("persists allowlisted audit fields and pages newest records first", async () => {
    await repository.create({
      actorId: "admin-1",
      actorRole: "ADMIN",
      action: "PRODUCT_UPDATE",
      targetType: "PRODUCT",
      targetId: "product-1",
      requestId: "req-1",
      outcome: "SUCCESS",
      metadata: { changedFields: ["name"] },
    });
    await repository.create({
      actorId: "admin-1",
      actorRole: "ADMIN",
      action: "PRODUCT_UPDATE",
      targetType: "PRODUCT",
      targetId: "product-2",
      requestId: "req-2",
      outcome: "FAILURE",
      metadata: { errorCode: "ConflictError" },
    });

    const page = await repository.findPage(
      { actorId: "admin-1", action: "PRODUCT_UPDATE" },
      1,
      1,
    );

    expect(page.total).toBe(2);
    expect(page.records).toHaveLength(1);
    expect(page.records[0]).toMatchObject({
      actorRole: "ADMIN",
      targetType: "PRODUCT",
      outcome: "FAILURE",
      metadata: { errorCode: "ConflictError" },
    });
  });

  it("filters denied outcomes and time ranges", async () => {
    await repository.create({
      actorId: "user-1",
      actorRole: "USER",
      action: "ADMIN_ACTION_DENIED",
      targetType: "PRODUCT_UPDATE",
      targetId: "product-1",
      requestId: "req-denied",
      outcome: "DENIED",
    });

    const page = await repository.findPage(
      {
        outcome: "DENIED",
        from: new Date(Date.now() - 60_000),
        to: new Date(Date.now() + 60_000),
      },
      1,
      100,
    );

    expect(page.total).toBe(1);
    expect(page.records[0].requestId).toBe("req-denied");
  });
});
