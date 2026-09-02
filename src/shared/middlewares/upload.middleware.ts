import multer from "multer";
import { Request } from "express";
import { BadRequestError } from "@shared/utils/errors";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(
      new BadRequestError(
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
