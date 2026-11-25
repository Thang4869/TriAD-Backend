import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  container,
  auditDeniedAdminAttempt,
  imageJobProcessor,
} from "@/container";
import { TOKENS } from "@core/di/tokens";

const mocks = vi.hoisted(() => ({
  processImage: vi.fn(),
}));

vi.mock("@/jobs/image-process.job", () => ({
  processImage: mocks.processImage,
}));

describe("container composition helpers", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    [
      { id: "product-1", orderId: "order-1", reviewId: "review-1" },
      "product-1",
    ],
    [{ orderId: "order-1", reviewId: "review-1" }, "order-1"],
    [{ reviewId: "review-1" }, "review-1"],
  ])(
    "records a denied admin attempt using the first available route id",
    async (params, expectedId) => {
      const recordDenied = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(container, "resolve").mockImplementation(((token: unknown) =>
        token === TOKENS.AuditService ? { recordDenied } : undefined) as never);
      const next = vi.fn();
      const request = { params } as unknown as Request;

      await auditDeniedAdminAttempt("ORDER_UPDATE")(
        request,
        {} as Response,
        next as NextFunction,
      );

      expect(recordDenied).toHaveBeenCalledWith(
        request,
        "ORDER_UPDATE",
        expectedId,
      );
      expect(next).toHaveBeenCalledOnce();
    },
  );

  it("resolves image dependencies and delegates to the image processor", async () => {
    const job = { data: { productId: "product-1" } };
    const productsRepository = { findById: vi.fn() };
    const imageStorage = { upload: vi.fn() };
    const auditService = { record: vi.fn() };
    mocks.processImage.mockResolvedValue({ processed: true });
    vi.spyOn(container, "resolve").mockImplementation(((token: unknown) => {
      if (token === TOKENS.ProductsRepository) return productsRepository;
      if (token === TOKENS.ImageStorage) return imageStorage;
      if (token === TOKENS.AuditService) return auditService;
      return undefined;
    }) as never);

    await expect(imageJobProcessor(job as never)).resolves.toEqual({
      processed: true,
    });

    expect(mocks.processImage).toHaveBeenCalledWith(
      job,
      productsRepository,
      imageStorage,
      auditService,
    );
  });
});
