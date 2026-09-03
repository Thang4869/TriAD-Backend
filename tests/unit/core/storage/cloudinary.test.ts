import { describe, it, expect, vi, beforeEach } from "vitest";
import { CloudinaryImageStorage } from "@core/storage/cloudinary";
import { v2 as cloudinary } from "cloudinary";

vi.mock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: vi.fn().mockImplementation((_options, _callback) => {
        return {
          end: vi.fn(),
          on: vi.fn(),
        };
      }),
    },
  },
}));

describe("CloudinaryImageStorage", () => {
  let storage: CloudinaryImageStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new CloudinaryImageStorage();
  });

  it("should upload buffer and return url and publicId", async () => {
    const mockResult = {
      secure_url: "https://cdn.com/img.jpg",
      public_id: "abc",
    };
    (cloudinary.uploader.upload_stream as any).mockImplementationOnce(
      (_options: any, callback: any) => {
        setTimeout(() => callback(null, mockResult), 10);
        return { end: vi.fn(), on: vi.fn() };
      },
    );

    const result = await storage.upload(Buffer.from("test"), "folder");
    expect(result).toEqual({ url: "https://cdn.com/img.jpg", publicId: "abc" });
    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
      { folder: "folder", resource_type: "image" },
      expect.any(Function),
    );
  });

  it("should reject on error", async () => {
    (cloudinary.uploader.upload_stream as any).mockImplementationOnce(
      (_options: any, callback: any) => {
        setTimeout(() => callback(new Error("upload failed"), undefined), 10);
        return { end: vi.fn(), on: vi.fn() };
      },
    );

    await expect(storage.upload(Buffer.from("test"), "folder")).rejects.toThrow(
      "upload failed",
    );
  });
});
