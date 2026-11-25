import { describe, expect, it, vi } from "vitest";
import {
  executeSagaStep,
  InMemorySagaStateStore,
  SagaTimeoutError,
} from "@shared/application/saga/saga-state";

describe("executeSagaStep", () => {
  const policy = { timeoutMs: 100, maxAttempts: 2, backoffMs: 0 };

  it("returns the operation result on the first successful attempt", async () => {
    const operation = vi.fn().mockResolvedValue("done");

    await expect(
      executeSagaStep("step", operation, policy, Date.now() + 1_000),
    ).resolves.toBe("done");
    expect(operation).toHaveBeenCalledOnce();
  });

  it("retries a failed operation and returns the later result", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue("recovered");

    await expect(
      executeSagaStep("step", operation, policy, Date.now() + 1_000),
    ).resolves.toBe("recovered");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("waits for a positive backoff before retrying", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue("recovered");

    await expect(
      executeSagaStep(
        "step",
        operation,
        { ...policy, backoffMs: 1 },
        Date.now() + 1_000,
      ),
    ).resolves.toBe("recovered");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("throws the last Error after exhausting all attempts", async () => {
    const failure = new Error("permanent");
    const operation = vi.fn().mockRejectedValue(failure);

    await expect(
      executeSagaStep("step", operation, policy, Date.now() + 1_000),
    ).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("normalizes a non-Error rejection after the final attempt", async () => {
    const operation = vi.fn().mockRejectedValue("raw failure");

    await expect(
      executeSagaStep(
        "step",
        operation,
        { ...policy, maxAttempts: 1 },
        Date.now() + 1_000,
      ),
    ).rejects.toThrow("Saga step step failed");
  });

  it("fails before invoking the operation when the saga deadline has passed", async () => {
    const operation = vi.fn();

    await expect(
      executeSagaStep("step", operation, policy, Date.now() - 1),
    ).rejects.toBeInstanceOf(SagaTimeoutError);
    expect(operation).not.toHaveBeenCalled();
  });

  it("times out an operation that exceeds its step deadline", async () => {
    await expect(
      executeSagaStep(
        "slow-step",
        () => new Promise<string>(() => undefined),
        { timeoutMs: 1, maxAttempts: 1, backoffMs: 0 },
        Date.now() + 1_000,
      ),
    ).rejects.toBeInstanceOf(SagaTimeoutError);
  });
});

describe("InMemorySagaStateStore", () => {
  it("loads undefined for a missing saga and round-trips saved state", async () => {
    const store = new InMemorySagaStateStore<{ step: string }>();

    await expect(store.load("missing")).resolves.toBeUndefined();
    await store.save("saga-1", { step: "STARTED" });
    await expect(store.load("saga-1")).resolves.toEqual({ step: "STARTED" });
  });
});
