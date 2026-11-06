import { beforeEach, describe, expect, it, vi } from "vitest";
import { imageQueue } from "@core/queue/bull";
import { BullMqImageProcessingQueue } from "@modules/products/infrastructure/queue/bullmq-image-processing-queue";

vi.mock("@core/queue/bull", () => ({
  imageQueue: { add: vi.fn() },
}));

describe("BullMqImageProcessingQueue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enqueues product image processing with the expected job name and payload", async () => {
    const input = {
      productId: "product-1",
      imageUrl: "https://cdn.example.com/product.jpg",
    } as never;

    vi.mocked(imageQueue.add).mockResolvedValue({} as never);
    await new BullMqImageProcessingQueue().enqueueProductImage(input);

    expect(imageQueue.add).toHaveBeenCalledWith("process-product-image", input);
  });

  it("propagates queue failures to the caller", async () => {
    vi.mocked(imageQueue.add).mockRejectedValue(new Error("queue unavailable"));

    await expect(
      new BullMqImageProcessingQueue().enqueueProductImage({} as never),
    ).rejects.toThrow("queue unavailable");
  });
});
