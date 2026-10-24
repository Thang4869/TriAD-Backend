import { v2 as cloudinary } from "cloudinary";
import { config } from "@config";
import { logger } from "@core/logger/winston";
import { withCircuitBreaker } from "@core/circuit-breaker/circuit-breaker";

cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
});

// Never retain provider messages/causes: they can contain keys, signatures or URLs.
function sanitizedUploadFailure(error: unknown): Error {
  const fields = error !== null && typeof error === "object" ? error : {};
  const rawStatus = "http_code" in fields ? fields.http_code : undefined;
  const httpStatus =
    typeof rawStatus === "number" &&
    Number.isInteger(rawStatus) &&
    rawStatus >= 400 &&
    rawStatus <= 599
      ? rawStatus
      : undefined;
  const message =
    "message" in fields && typeof fields.message === "string"
      ? fields.message
      : "";
  const code = "code" in fields ? fields.code : undefined;

  let reason = "unknown";
  if (/^Must supply (api_key|api_secret|cloud_name)\b/.test(message)) {
    reason = "missing_configuration";
  } else if (/^Invalid API key\b/i.test(message)) {
    reason = "invalid_api_key";
  } else if (/^Invalid Signature\b/i.test(message)) {
    reason = "invalid_signature";
  } else if (/^(Invalid|Unknown) cloud[ _]name\b/i.test(message)) {
    reason = "invalid_cloud_name";
  } else if (message === "Cloudinary upload returned an invalid result") {
    reason = "invalid_response";
  } else if (
    httpStatus === 499 ||
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT"
  ) {
    reason = "timeout";
  } else if (httpStatus === 401) {
    reason = "authentication";
  } else if (httpStatus === 403) {
    reason = "forbidden";
  } else if (httpStatus === 400) {
    reason = "invalid_request";
  } else if (httpStatus === 404) {
    reason = "not_found";
  } else if (httpStatus === 420 || httpStatus === 429) {
    reason = "rate_limited";
  } else if (httpStatus !== undefined && httpStatus >= 500) {
    reason = "provider_unavailable";
  } else if (
    typeof code === "string" &&
    ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EPIPE"].includes(
      code,
    )
  ) {
    reason = "network";
  }

  logger.error("Cloudinary upload failed", {
    reason,
    ...(httpStatus !== undefined && { httpStatus }),
  });
  return new Error(
    `Cloudinary upload failed: ${reason}${httpStatus !== undefined ? ` (HTTP ${httpStatus})` : ""}`,
  );
}

export interface IImageStorage {
  upload(
    buffer: Buffer,
    folder: string,
  ): Promise<{ url: string; publicId: string }>;
}

export class CloudinaryImageStorage implements IImageStorage {
  private readonly uploadWithBreaker = withCircuitBreaker(
    (buffer: Buffer, folder: string) => this.rawUpload(buffer, folder),
    { name: "cloudinary-upload", timeout: 10_000, resetTimeout: 20_000 },
  );

  upload(
    buffer: Buffer,
    folder: string,
  ): Promise<{ url: string; publicId: string }> {
    return this.uploadWithBreaker(buffer, folder);
  }

  private rawUpload(
    buffer: Buffer,
    folder: string,
  ): Promise<{ url: string; publicId: string }> {
    return new Promise<{ url: string; publicId: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: "image" },
        (error, result) => {
          if (error) return reject(error);
          if (!result?.secure_url || !result.public_id) {
            return reject(
              new Error("Cloudinary upload returned an invalid result"),
            );
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      stream.once("error", reject);
      stream.end(buffer);
    }).catch((error: unknown) => {
      // Log the original failure before the breaker opens and hides later attempts.
      throw sanitizedUploadFailure(error);
    });
  }
}
