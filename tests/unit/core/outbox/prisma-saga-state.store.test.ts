import { describe, expect, it, vi } from "vitest";
import { PrismaSagaStateStore } from "@core/outbox/prisma-saga-state.store";
import prisma from "@core/database/prisma";

vi.mock("@core/database/prisma", () => ({
  default: { sagaState: { findUnique: vi.fn(), upsert: vi.fn() } },
}));

describe("PrismaSagaStateStore", () => {
  it("loads only state owned by the requested saga type", async () => {
    vi.mocked(prisma.sagaState.findUnique).mockResolvedValue({
      sagaType: "checkout",
      state: { step: "ORDER_PLACED" },
    } as never);
    const store = new PrismaSagaStateStore<{ step: string }>("checkout");

    await expect(store.load("saga-1")).resolves.toEqual({
      step: "ORDER_PLACED",
    });
  });

  it("persists completed state and increments version on updates", async () => {
    const store = new PrismaSagaStateStore<{ step: string }>("checkout");
    await store.save("saga-1", { step: "COMPLETED" });

    expect(prisma.sagaState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "saga-1" },
        update: expect.objectContaining({ version: { increment: 1 } }),
      }),
    );
  });
});
