import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { AuditController } from "@modules/admin/audit/audit.controller";
import type { AuditService } from "@modules/admin/audit/application/audit.service";

function responseMock() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("AuditController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses filters, pagination and date boundaries before querying audit logs", async () => {
    const result = { items: [], page: 2, limit: 25, total: 0, totalPages: 0 };
    const service = {
      query: vi.fn().mockResolvedValue(result),
    } as unknown as AuditService;
    const res = responseMock();
    const from = "2026-01-01T00:00:00.000Z";
    const to = "2026-02-01T00:00:00.000Z";
    const req = {
      query: {
        page: "2",
        limit: "25",
        actorId: "user-1",
        action: "PRODUCT_UPDATED",
        targetType: "PRODUCT",
        targetId: "product-1",
        outcome: "SUCCESS",
        from,
        to,
      },
    } as unknown as Request;

    await new AuditController(service).list(req, res, vi.fn());

    expect(service.query).toHaveBeenCalledWith(
      {
        actorId: "user-1",
        action: "PRODUCT_UPDATED",
        targetType: "PRODUCT",
        targetId: "product-1",
        outcome: "SUCCESS",
        from: new Date(from),
        to: new Date(to),
      },
      2,
      25,
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  it("uses default pagination and leaves optional filters undefined", async () => {
    const service = {
      query: vi.fn().mockResolvedValue({ items: [], page: 1, limit: 50 }),
    } as unknown as AuditService;
    const res = responseMock();

    await new AuditController(service).list(
      { query: {} } as unknown as Request,
      res,
      vi.fn(),
    );

    expect(service.query).toHaveBeenCalledWith(
      {
        actorId: undefined,
        action: undefined,
        targetType: undefined,
        targetId: undefined,
        outcome: undefined,
        from: undefined,
        to: undefined,
      },
      1,
      50,
    );
  });
});
