import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import sharp from "sharp";
import multer from "multer";
import { describe, expect, it } from "vitest";
import {
  uploadProductImage,
  validateUploadedImage,
} from "@shared/middlewares/upload.middleware";

function uploadApp() {
  const app = express();
  app.post("/upload", uploadProductImage, validateUploadedImage, (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Missing image" });
      return;
    }
    res.status(200).json({ size: req.file.size });
  });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      res.status(400).json({ code: error.code });
      return;
    }
    res.status(400).json({
      error: error instanceof Error ? error.message : "Unknown upload error",
    });
  });
  return app;
}

describe("upload middleware with real Multer and Sharp", () => {
  it.each(["jpeg", "png", "webp"] as const)(
    "accepts a real %s image within limits",
    async (format) => {
      const image = await sharp({
        create: {
          width: 8,
          height: 8,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })[format]().toBuffer();
      const response = await request(uploadApp())
        .post("/upload")
        .attach("image", image, { filename: `valid.${format}`, contentType: `image/${format}` });
      expect(response.status).toBe(200);
      expect(response.body.size).toBe(image.byteLength);
    },
  );

  it("rejects non-image MIME types", async () => {
    const response = await request(uploadApp())
      .post("/upload")
      .attach("image", Buffer.from("not an image"), {
        filename: "fake.txt",
        contentType: "text/plain",
      });
    expect(response.status).toBe(400);
  });

  it("rejects an invalid payload sent with an allowed image MIME", async () => {
    const response = await request(uploadApp())
      .post("/upload")
      .attach("image", Buffer.from("not a real png"), {
        filename: "fake.png",
        contentType: "image/png",
      });
    expect(response.status).toBe(400);
    // Multer or Sharp may reject malformed multipart bytes first; either way
    // the upload must never reach the success handler.
    expect(response.body.size).toBeUndefined();
  });

  it("rejects files larger than five megabytes", async () => {
    const response = await request(uploadApp())
      .post("/upload")
      .attach("image", Buffer.alloc(5 * 1024 * 1024 + 1, 0), {
        filename: "too-large.png",
        contentType: "image/png",
      });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("LIMIT_FILE_SIZE");
  });

  it("rejects an extra multipart field", async () => {
    const response = await request(uploadApp())
      .post("/upload")
      .field("unwanted", "input")
      .attach("image", Buffer.from("content"), {
        filename: "fake.png",
        contentType: "image/png",
      });
    expect(response.status).toBe(400);
    expect(["LIMIT_FIELD_COUNT", "LIMIT_PART_COUNT"]).toContain(response.body.code);
  });
});
