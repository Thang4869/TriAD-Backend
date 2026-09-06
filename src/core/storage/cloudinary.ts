import { v2 as cloudinary } from "cloudinary";
import { config } from "@config";
import { withCircuitBreaker } from "@core/circuit-breaker/circuit-breaker";

cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
});

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
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: "image" },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      stream.end(buffer);
    });
  }
}
