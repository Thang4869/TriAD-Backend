import sharp from "sharp";
import path from "path";
import fs from "fs";
import { logger } from "@core/logger/winston";

export const processImage = async (job: any) => {
  const { productId, imageUrl } = job.data;
  logger.info(`Processing image for product ${productId}: ${imageUrl}`);

  try {
    const imageBuffer = await sharp(imageUrl)
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    return { processed: true, size: imageBuffer.length };
  } catch (error) {
    logger.error("Image processing failed", { productId, error });
    throw error;
  }
};
