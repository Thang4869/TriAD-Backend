import { describe, expect, it, vi } from "vitest";
import {
  AuditService,
  auditRequestContext,
} from "@modules/admin/audit/application/audit.service";
import { AUDIT_ACTIONS } from "@modules/admin/audit/application/audit.types";
import { logger } from "@core/logger/winston";

vi.mock("@core/logger/winston", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

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

describe("AuditService metadata and fallback paths", () => {
  it("sanitizes scalar metadata, truncates strings, and filters bounded arrays", async () => {
    const repository = { create: vi.fn().mockResolvedValue(undefined) };
    const service = new AuditService(repository as never);
    const longValue = "x".repeat(300);
    const values = Array.from({ length: 25 }, (_, index) => `field-${index}`);

    await service.record({
      actorId: "admin-1",
      actorRole: "ADMIN",
      action: AUDIT_ACTIONS.PRODUCT_UPDATE,
      targetType: "PRODUCT",
      requestId: "req-1",
      outcome: "SUCCESS",
      metadata: {
        changedFields: ["name", 42, longValue],
        previousStatus: longValue,
        queued: true,
        jobId: 42,
        reason: values,
        newStatus: { nested: true },
        password: "secret",
      },
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          changedFields: ["name", longValue.slice(0, 256)],
          previousStatus: longValue.slice(0, 256),
          queued: true,
          jobId: 42,
          reason: values.slice(0, 20),
        },
      }),
    );
  });

  it("omits undefined and fully filtered metadata", async () => {
    const repository = { create: vi.fn().mockResolvedValue(undefined) };
    const service = new AuditService(repository as never);
    const base = {
      actorId: "admin-1",
      actorRole: "ADMIN",
      action: AUDIT_ACTIONS.PRODUCT_UPDATE,
      targetType: "PRODUCT",
      requestId: "req-1",
      outcome: "SUCCESS" as const,
    };

    await service.record(base);
    await service.record({
      ...base,
      metadata: { password: "secret", extra: 1 },
    });

    expect(repository.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ metadata: undefined }),
    );
    expect(repository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ metadata: undefined }),
    );
  });

  it("does not record denied attempts for missing users or admins", async () => {
    const repository = { create: vi.fn() };
    const service = new AuditService(repository as never);

    await service.recordDenied(request({ user: undefined }), "PRODUCT_UPDATE");
    await service.recordDenied(request(), "PRODUCT_UPDATE");

    expect(repository.create).not.toHaveBeenCalled();
  });

  it("uses fallback request id and safely logs non-Error storage failures for denied attempts", async () => {
    const repository = {
      create: vi.fn().mockRejectedValue("storage unavailable"),
    };
    const service = new AuditService(repository as never);

    await expect(
      service.recordDenied(
        request({
          user: { id: "user-1", role: "USER" },
          requestId: undefined,
        }),
        "PRODUCT_UPDATE",
      ),
    ).resolves.toBeUndefined();

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "missing-request-id",
        outcome: "DENIED",
      }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "Unable to persist denied admin audit event",
      expect.objectContaining({ error: "storage unavailable" }),
    );
  });

  it("records UNKNOWN_ERROR when a failed mutation throws a non-Error value", async () => {
    const repository = { create: vi.fn().mockResolvedValue(undefined) };
    const service = new AuditService(repository as never);

    await expect(
      service.recordMutation(
        request({ user: undefined, requestId: undefined }),
        {
          action: AUDIT_ACTIONS.PRODUCT_UPDATE,
          targetType: "PRODUCT",
        },
        async () => {
          throw "unexpected failure";
        },
      ),
    ).rejects.toBe("unexpected failure");

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorRole: "UNKNOWN",
        requestId: "missing-request-id",
        outcome: "FAILURE",
        metadata: { errorCode: "UNKNOWN_ERROR" },
      }),
    );
  });

  it("does not fail a committed mutation when a non-Error audit write fails", async () => {
    const repository = {
      create: vi.fn().mockRejectedValue("storage unavailable"),
    };
    const service = new AuditService(repository as never);

    await expect(
      service.recordMutation(
        request({ user: undefined, requestId: undefined }),
        {
          action: AUDIT_ACTIONS.PRODUCT_UPDATE,
          targetType: "PRODUCT",
        },
        async () => "committed",
      ),
    ).resolves.toBe("committed");

    expect(logger.error).toHaveBeenCalledWith(
      "Admin mutation committed but success audit write failed",
      expect.objectContaining({
        error: "storage unavailable",
        action: AUDIT_ACTIONS.PRODUCT_UPDATE,
        requestId: "missing-request-id",
      }),
    );
  });

  it("logs and suppresses audit persistence failures while recording a failure", async () => {
    const repository = {
      create: vi.fn().mockRejectedValue(new Error("write failed")),
    };
    const service = new AuditService(repository as never);

    await expect(
      service.recordFailureBestEffort(
        {
          actorId: "admin-1",
          actorRole: "ADMIN",
          action: AUDIT_ACTIONS.PRODUCT_UPDATE,
          targetType: "PRODUCT",
          requestId: "req-1",
        } as never,
        new Error("business failure"),
      ),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      "Unable to persist failed admin audit event",
      expect.objectContaining({ error: "write failed" }),
    );
  });

  it("builds audit request context with authenticated and anonymous defaults", () => {
    expect(auditRequestContext(request())).toEqual({
      actorId: "user-1",
      actorRole: "ADMIN",
      requestId: "req-audit-test",
    });
    expect(
      auditRequestContext(request({ user: undefined, requestId: undefined })),
    ).toEqual({
      actorId: undefined,
      actorRole: "UNKNOWN",
      requestId: "missing-request-id",
    });
  });
});

it("stringifies non-Error audit persistence failures", async () => {
  const repository = { create: vi.fn().mockRejectedValue("storage offline") };
  const service = new AuditService(repository as never);

  await expect(
    service.recordFailureBestEffort(
      {
        actorId: "admin-1",
        actorRole: "ADMIN",
        action: AUDIT_ACTIONS.PRODUCT_UPDATE,
        targetType: "PRODUCT",
        requestId: "req-1",
      } as never,
      "business failure",
    ),
  ).resolves.toBeUndefined();

  expect(logger.error).toHaveBeenCalledWith(
    "Unable to persist failed admin audit event",
    expect.objectContaining({ error: "storage offline" }),
  );
});
