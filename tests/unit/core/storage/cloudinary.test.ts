import { PassThrough } from "node:stream";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CloudinaryImageStorage } from "@core/storage/cloudinary";
import { logger } from "@core/logger/winston";
import { v2 as cloudinary } from "cloudinary";

vi.mock("@core/logger/winston", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("cloudinary", () => ({
  v2: { config: vi.fn(), uploader: { upload_stream: vi.fn() } },
}));

const sensitive = "fixture-key-secret-signature";
function callbackResult(error: unknown, result?: unknown) {
  (cloudinary.uploader.upload_stream as any).mockImplementationOnce(
    (_options: any, callback: any) => {
      queueMicrotask(() => callback(error, result));
      return new PassThrough();
    },
  );
}

describe("CloudinaryImageStorage", () => {
  let storage: CloudinaryImageStorage;
  beforeEach(() => {
    vi.resetAllMocks();
    storage = new CloudinaryImageStorage();
  });

  it("uploads a buffer and returns the URL/public ID without logging", async () => {
    callbackResult(null, {
      secure_url: "https://cdn.com/img.jpg",
      public_id: "abc",
    });
    await expect(
      storage.upload(Buffer.from("test"), "folder"),
    ).resolves.toEqual({
      url: "https://cdn.com/img.jpg",
      publicId: "abc",
    });
    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
      { folder: "folder", resource_type: "image" },
      expect.any(Function),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each([
    [{ http_code: 401, message: sensitive }, "authentication", 401],
    [{ http_code: 403, message: sensitive }, "forbidden", 403],
    [{ http_code: 400, message: sensitive }, "invalid_request", 400],
    [{ http_code: 404, message: sensitive }, "not_found", 404],
    [{ http_code: 420, message: sensitive }, "rate_limited", 420],
    [{ http_code: 429, message: sensitive }, "rate_limited", 429],
    [{ http_code: 500, message: sensitive }, "provider_unavailable", 500],
    [{ http_code: 503, message: sensitive }, "provider_unavailable", 503],
    [{ http_code: 499, message: sensitive }, "timeout", 499],
    [{ code: "ETIMEDOUT", message: sensitive }, "timeout", undefined],
    [{ code: "ESOCKETTIMEDOUT", message: sensitive }, "timeout", undefined],
    [{ code: "ECONNRESET", message: sensitive }, "network", undefined],
    [{ code: "ENOTFOUND", message: sensitive }, "network", undefined],
    [
      { message: "Invalid API key " + sensitive, http_code: 401 },
      "invalid_api_key",
      401,
    ],
    [
      { message: "Invalid Signature " + sensitive, http_code: 401 },
      "invalid_signature",
      401,
    ],
    [
      { message: "Unknown cloud_name " + sensitive },
      "invalid_cloud_name",
      undefined,
    ],
    [
      new Error("Must supply api_key " + sensitive),
      "missing_configuration",
      undefined,
    ],
    [new Error(sensitive), "unknown", undefined],
    [sensitive, "unknown", undefined],
    [
      { http_code: sensitive, code: sensitive, message: sensitive },
      "unknown",
      undefined,
    ],
    [{ http_code: 401.5, message: sensitive }, "unknown", undefined],
    [{ http_code: Infinity, message: sensitive }, "unknown", undefined],
    [{ http_code: 200, message: sensitive }, "unknown", undefined],
  ])("sanitizes provider failure %#", async (error, reason, httpStatus) => {
    callbackResult(error);
    const caught = await storage
      .upload(Buffer.from("test"), "private-folder")
      .catch((failure: unknown) => failure);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(
      `Cloudinary upload failed: ${reason}${httpStatus !== undefined ? ` (HTTP ${httpStatus})` : ""}`,
    );
    expect((caught as Error).cause).toBeUndefined();
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      "Cloudinary upload failed",
      {
        reason,
        ...(httpStatus !== undefined && { httpStatus }),
      },
    );
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(
      sensitive,
    );
    expect(String((caught as Error).stack)).not.toContain(sensitive);
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(
      "private-folder",
    );
  });

  it.each([
    undefined,
    {},
    { public_id: "some-id" },
    { secure_url: "https://cdn.com/img.jpg" },
  ])(
    "rejects an invalid SDK result without leaking its contents %#",
    async (result) => {
      callbackResult(undefined, result);
      await expect(
        storage.upload(Buffer.from("test"), "folder"),
      ).rejects.toThrow("Cloudinary upload failed: invalid_response");
      expect(logger.error).toHaveBeenCalledWith("Cloudinary upload failed", {
        reason: "invalid_response",
      });
    },
  );

  it("sanitizes synchronous SDK configuration errors", async () => {
    (cloudinary.uploader.upload_stream as any).mockImplementationOnce(() => {
      throw new Error("Must supply cloud_name " + sensitive);
    });
    await expect(storage.upload(Buffer.from("test"), "folder")).rejects.toThrow(
      "Cloudinary upload failed: missing_configuration",
    );
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(
      sensitive,
    );
  });

  it("handles stream errors and callback failure only once", async () => {
    (cloudinary.uploader.upload_stream as any).mockImplementationOnce(
      (_options: any, callback: any) => {
        const stream = new PassThrough();
        const error = Object.assign(new Error(sensitive), {
          code: "ECONNRESET",
        });
        queueMicrotask(() => {
          stream.emit("error", error);
          callback(error);
        });
        return stream;
      },
    );
    await expect(storage.upload(Buffer.from("test"), "folder")).rejects.toThrow(
      "Cloudinary upload failed: network",
    );
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("retains the first safe diagnosis when the retry hits an open breaker", async () => {
    callbackResult({ http_code: 401, message: "Invalid API key " + sensitive });
    await expect(storage.upload(Buffer.from("test"), "folder")).rejects.toThrow(
      "invalid_api_key",
    );
    await expect(storage.upload(Buffer.from("test"), "folder")).rejects.toThrow(
      "Breaker is open",
    );
    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      "Cloudinary upload failed",
      {
        reason: "invalid_api_key",
        httpStatus: 401,
      },
    );
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(
      sensitive,
    );
  });
});
