import { describe, it, expect, vi } from "vitest";
import { processImage } from "@/jobs/image-process.job";
import sharp from "sharp";
import prisma from "@core/database/prisma";

vi.mock("sharp", () => ({
  default: vi.fn().mockReturnValue({
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("processed")),
  }),
}));

vi.mock("@core/database/prisma", () => ({
  default: {
    product: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@core/storage/cloudinary", () => ({
  CloudinaryImageStorage: class {
    upload = vi
      .fn()
      .mockResolvedValue({ url: "https://cdn.com/processed.jpg" });
  },
}));

describe("image-process.job", () => {
  const bufferBase64 = Buffer.from("fake").toString("base64");

  it("should process and upload image, update product", async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: "prod-1",
      images: ["old.jpg"],
    } as any);
    vi.mocked(prisma.product.update).mockResolvedValue({} as any);

    const job = { data: { productId: "prod-1", imageBuffer: bufferBase64 } };
    const result = await processImage(job);

    expect(sharp).toHaveBeenCalled();
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: "prod-1" },
      data: { images: ["old.jpg", "https://cdn.com/processed.jpg"] },
    });
    expect(result).toEqual({
      processed: true,
      url: "https://cdn.com/processed.jpg",
    });
  });

  it("should throw if product not found", async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);
    const job = { data: { productId: "prod-1", imageBuffer: bufferBase64 } };
    await expect(processImage(job)).rejects.toThrow("Product prod-1 not found");
  });

  it("should throw if no imageBuffer", async () => {
    const job = { data: { productId: "prod-1" } };
    await expect(processImage(job)).rejects.toThrow("No image buffer provided");
  });
});
