import { describe, it, expect, vi } from "vitest";
import { processImage } from "@/jobs/image-process.job";
import sharp from "sharp";
import type { IProductsRepository } from "@modules/products/application/ports/products.repository.port";
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
    updateWithEvents: vi.fn(),
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
      name: "Test Product",
      description: null,
      price: 100,
      stock: 10,
      category: "test",
      images: ["old.jpg"],
      slug: "test-product",
      isActive: true,
      version: 0,
    } as any);

    vi.mocked(productsRepository.updateWithEvents).mockResolvedValue({} as any);

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

    expect(productsRepository.updateWithEvents).toHaveBeenCalledWith(
      "prod-1",
      { images: ["old.jpg", "https://cdn.com/processed.jpg"] },
      expect.objectContaining({ id: "prod-1" }),
    );

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

  it("should propagate atomic product update failure for worker retry", async () => {
    vi.mocked(storage.upload).mockResolvedValue({
      url: "https://cdn.com/processed.jpg",
      publicId: "products/prod-1",
    });
    vi.mocked(productsRepository.findById).mockResolvedValue({
      id: "prod-1",
      name: "Product",
      description: null,
      price: 100,
      stock: 1,
      category: "category",
      images: [],
      slug: "product",
      isActive: true,
      version: 0,
    } as any);
    vi.mocked(productsRepository.updateWithEvents).mockRejectedValue(
      new Error("outbox persistence failed"),
    );

    await expect(
      processImage(
        { data: { productId: "prod-1", imageBuffer: bufferBase64 } },
        productsRepository,
        storage,
      ),
    ).rejects.toThrow("outbox persistence failed");
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
