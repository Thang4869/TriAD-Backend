import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { logger } from "@core/logger/winston";

export const processImage = async (job: any) => {
  const { productId, imageUrl } = job.data;
  logger.info(`Processing image for product ${productId}: ${imageUrl}`);

  try {
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();

    const processed = await sharp(Buffer.from(buffer))
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const uploadDir = path.join(process.cwd(), "uploads", "products");
    await fs.mkdir(uploadDir, { recursive: true });
    const filename = `product-${productId}-${Date.now()}.jpg`;
    const filepath = path.join(uploadDir, filename);
    await fs.writeFile(filepath, processed);

    logger.info(`Image processed and saved: ${filepath}`);
    return { processed: true, filename };
  } catch (error) {
    logger.error("Image processing failed", { productId, error });
    throw error;
  }
};