import { describe, expect, it } from "vitest";
import { auditQuerySchema } from "@modules/admin/audit/dto/audit.dto";

describe("auditQuerySchema", () => {
  it("accepts Prisma CUID actor identifiers", () => {
    const result = auditQuerySchema.safeParse({
      query: {
        actorId: "cm1234567890abcdefghijkl",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty actorId", () => {
    const result = auditQuerySchema.safeParse({
      query: {
        actorId: "",
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects actorId longer than 128 characters", () => {
    const result = auditQuerySchema.safeParse({
      query: {
        actorId: "a".repeat(129),
      },
    });

    expect(result.success).toBe(false);
  });

  it("validates audit date range when both bounds are supplied", () => {
    expect(
      auditQuerySchema.safeParse({
        query: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-02T00:00:00.000Z",
        },
      }).success,
    ).toBe(true);

    expect(
      auditQuerySchema.safeParse({
        query: {
          from: "2026-01-02T00:00:00.000Z",
          to: "2026-01-01T00:00:00.000Z",
        },
      }).success,
    ).toBe(false);
  });

  it("allows either audit date bound to be supplied independently", () => {
    expect(
      auditQuerySchema.safeParse({
        query: { from: "2026-01-01T00:00:00.000Z" },
      }).success,
    ).toBe(true);
    expect(
      auditQuerySchema.safeParse({
        query: { to: "2026-01-02T00:00:00.000Z" },
      }).success,
    ).toBe(true);
  });

  it("allows actorId to be omitted", () => {
    const result = auditQuerySchema.safeParse({
      query: {},
    });

    expect(result.success).toBe(true);
  });
});
