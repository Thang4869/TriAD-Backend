import multer from "multer";
import { Request } from "express";
import { ValidationError } from "@shared/errors/application-error";
import sharp from "sharp";
import { NextFunction, Response } from "express";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(
      new ValidationError(
        "Only JPEG, PNG or WEBP images are allowed",
      ) as unknown as Error,
    );
  }
  cb(null, true);
}

export const uploadProductImage = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
}).single("image");

export const validateUploadedImage = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.file) {
    next();
    return;
  }

  try {
    const metadata = await sharp(req.file.buffer).metadata();

    if (
      !metadata.format ||
      !["jpeg", "png", "webp"].includes(metadata.format)
    ) {
      next(new ValidationError("Invalid image content"));
      return;
    }

    next();
  } catch {
    next(new ValidationError("Invalid image content"));
  }
};
