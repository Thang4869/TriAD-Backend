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

  it("allows actorId to be omitted", () => {
    const result = auditQuerySchema.safeParse({
      query: {},
    });

    expect(result.success).toBe(true);
  });
});
