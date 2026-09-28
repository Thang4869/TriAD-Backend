import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaSagaStateStore } from "@shared/infrastructure/saga/prisma-saga-state.store";

vi.mock("@core/database/prisma", () => ({
  default: {
    sagaState: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

type TestSagaState = {
  step: string;
  orderId: string;
};

describe("PrismaSagaStateStore", () => {
  const store = new PrismaSagaStateStore<TestSagaState>("CheckoutSaga");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("load() trả state khi saga tồn tại và đúng sagaType", async () => {
    const state: TestSagaState = {
      step: "RESERVE_STOCK",
      orderId: "order-1",
    };

    vi.mocked(prisma.sagaState.findUnique).mockResolvedValue({
      id: "saga-1",
      sagaType: "CheckoutSaga",
      state,
      version: 1,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(store.load("saga-1")).resolves.toEqual(state);

    expect(prisma.sagaState.findUnique).toHaveBeenCalledWith({
      where: { id: "saga-1" },
    });
  });

  it("load() trả undefined khi saga không tồn tại", async () => {
    vi.mocked(prisma.sagaState.findUnique).mockResolvedValue(null);

    await expect(store.load("missing-saga")).resolves.toBeUndefined();
  });

  it("load() trả undefined khi sagaType không khớp", async () => {
    vi.mocked(prisma.sagaState.findUnique).mockResolvedValue({
      id: "saga-1",
      sagaType: "CancellationRefundSaga",
      state: {
        step: "STARTED",
        orderId: "order-1",
      },
      version: 1,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(store.load("saga-1")).resolves.toBeUndefined();
  });

  it("save() tạo saga state mới với completedAt=null", async () => {
    const state: TestSagaState = {
      step: "RESERVE_STOCK",
      orderId: "order-1",
    };

    vi.mocked(prisma.sagaState.upsert).mockResolvedValue({
      id: "saga-1",
      sagaType: "CheckoutSaga",
      state,
      version: 0,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await store.save("saga-1", state);

    expect(prisma.sagaState.upsert).toHaveBeenCalledWith({
      where: {
        id: "saga-1",
      },
      create: {
        id: "saga-1",
        sagaType: "CheckoutSaga",
        state,
        completedAt: null,
      },
      update: {
        state,
        completedAt: null,
        version: {
          increment: 1,
        },
      },
    });
  });

  it.each(["COMPLETED", "COMPENSATED"])(
    "save() set completedAt khi state.step=%s",
    async (step) => {
      const state: TestSagaState = {
        step,
        orderId: "order-1",
      };

      vi.mocked(prisma.sagaState.upsert).mockResolvedValue({
        id: "saga-1",
        sagaType: "CheckoutSaga",
        state,
        version: 1,
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await store.save("saga-1", state);

      const call = vi.mocked(prisma.sagaState.upsert).mock.calls[0][0];

      expect(call.where).toEqual({
        id: "saga-1",
      });

      expect(call.create).toEqual({
        id: "saga-1",
        sagaType: "CheckoutSaga",
        state,
        completedAt: expect.any(Date),
      });

      expect(call.update).toEqual({
        state,
        completedAt: expect.any(Date),
        version: {
          increment: 1,
        },
      });
    },
  );
});
