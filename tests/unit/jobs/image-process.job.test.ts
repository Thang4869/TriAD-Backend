import { describe, it, expect, vi } from "vitest";
import { processImage } from "@/jobs/image-process.job";
import sharp from "sharp";
import type { IProductsRepository } from "@modules/products/products.repository";
import type { IImageStorage } from "@core/storage/cloudinary";

vi.mock("sharp", () => ({
  default: vi.fn().mockReturnValue({
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("processed")),
  }),
}));

describe("image-process.job", () => {
  const bufferBase64 = Buffer.from("fake").toString("base64");

  const productsRepository = {
    findById: vi.fn(),
    update: vi.fn(),
  } as unknown as IProductsRepository;

  const storage = {
    upload: vi.fn(),
  } as unknown as IImageStorage;

  it("should process and upload image, update product", async () => {
    vi.mocked(storage.upload).mockResolvedValue({
      url: "https://cdn.com/processed.jpg",
      publicId: "products/prod-1",
    });

    vi.mocked(productsRepository.findById).mockResolvedValue({
      id: "prod-1",
      images: ["old.jpg"],
    } as any);

    vi.mocked(productsRepository.update).mockResolvedValue({} as any);

    const job = {
      data: {
        productId: "prod-1",
        imageBuffer: bufferBase64,
      },
    };

    const result = await processImage(job, productsRepository, storage);

    expect(sharp).toHaveBeenCalled();

    expect(storage.upload).toHaveBeenCalledWith(
      expect.any(Buffer),
      "products/prod-1",
    );

    expect(productsRepository.update).toHaveBeenCalledWith("prod-1", {
      images: ["old.jpg", "https://cdn.com/processed.jpg"],
    });

    expect(result).toEqual({
      processed: true,
      url: "https://cdn.com/processed.jpg",
    });
  });

  it("should throw if product not found", async () => {
    vi.mocked(storage.upload).mockResolvedValue({
      url: "https://cdn.com/processed.jpg",
      publicId: "products/prod-1",
    });

    vi.mocked(productsRepository.findById).mockResolvedValue(null);

    const job = {
      data: {
        productId: "prod-1",
        imageBuffer: bufferBase64,
      },
    };

    await expect(
      processImage(job, productsRepository, storage),
    ).rejects.toThrow("Product prod-1 not found");
  });

  it("should throw if no imageBuffer", async () => {
    const job = {
      data: {
        productId: "prod-1",
      },
    };

    await expect(
      processImage(job, productsRepository, storage),
    ).rejects.toThrow("No image buffer provided");
  });
});
