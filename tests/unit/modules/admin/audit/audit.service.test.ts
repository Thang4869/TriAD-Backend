import { describe, expect, it, vi } from "vitest";
import { AuditService } from "@modules/admin/audit/application/audit.service";
import { AUDIT_ACTIONS } from "@modules/admin/audit/application/audit.types";

function request(overrides: Record<string, unknown> = {}) {
  return {
    requestId: "req-audit-test",
    user: { id: "user-1", role: "ADMIN" },
    params: {},
    ...overrides,
  } as never;
}

describe("AuditService", () => {
  it("allowlists metadata and removes sensitive fields", async () => {
    const repository = { create: vi.fn().mockResolvedValue(undefined) };
    const service = new AuditService(repository as never);

    await service.record({
      actorId: "admin-1",
      actorRole: "ADMIN",
      action: AUDIT_ACTIONS.PRODUCT_UPDATE,
      targetType: "PRODUCT",
      targetId: "product-1",
      requestId: "req-1",
      outcome: "SUCCESS",
      metadata: {
        changedFields: ["name", "password"],
        password: "must-not-persist",
        arbitrary: "must-not-persist",
      },
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { changedFields: ["name", "password"] },
      }),
    );
    expect(JSON.stringify(repository.create.mock.calls[0][0])).not.toContain(
      "must-not-persist",
    );
  });

  it("records success only after the operation succeeds", async () => {
    const repository = { create: vi.fn().mockResolvedValue(undefined) };
    const service = new AuditService(repository as never);

    await service.recordMutation(
      request(),
      {
        action: AUDIT_ACTIONS.PRODUCT_CREATE,
        targetType: "PRODUCT",
        targetId: (result: { id: string }) => result.id,
      },
      async () => ({ id: "product-1" }),
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "SUCCESS",
        targetId: "product-1",
      }),
    );
  });

  it("records a failed operation without masking the business error", async () => {
    const repository = { create: vi.fn().mockResolvedValue(undefined) };
    const service = new AuditService(repository as never);
    const businessError = new Error("business failure");

    await expect(
      service.recordMutation(
        request(),
        {
          action: AUDIT_ACTIONS.ORDER_STATUS_UPDATE,
          targetType: "ORDER",
          targetId: "order-1",
        },
        async () => {
          throw businessError;
        },
      ),
    ).rejects.toBe(businessError);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "FAILURE" }),
    );
  });

  it("records denied attempts but fails open when audit storage is unavailable", async () => {
    const repository = {
      create: vi
        .fn()
        .mockRejectedValue(new Error("audit database unavailable")),
    };
    const service = new AuditService(repository as never);

    await expect(
      service.recordDenied(
        request({ user: { id: "user-1", role: "USER" } }),
        "PRODUCT_UPDATE",
        "product-1",
      ),
    ).resolves.toBeUndefined();
  });

  it("caps query page size", async () => {
    const repository = {
      create: vi.fn(),
      findPage: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    };
    const service = new AuditService(repository as never);

    await service.query({}, 1, 1000);

    expect(repository.findPage).toHaveBeenCalledWith({}, 1, 100);
  });

  it("does not turn a committed mutation into a false failure when audit storage fails", async () => {
    const repository = {
      create: vi
        .fn()
        .mockRejectedValue(new Error("audit database unavailable")),
    };
    const service = new AuditService(repository as never);

    await expect(
      service.recordMutation(
        request(),
        {
          action: AUDIT_ACTIONS.PRODUCT_UPDATE,
          targetType: "PRODUCT",
          targetId: "product-1",
        },
        async () => "committed",
      ),
    ).resolves.toBe("committed");
  });
});
