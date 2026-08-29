import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import prisma from "@core/database/prisma";
import { logger } from "@core/logger/winston";

export interface ImageProcessJobData {
  productId: string;
  localFilePath?: string;
  imageUrl?: string;
}

const PRODUCT_IMAGE_DIR = path.join(process.cwd(), "uploads", "products");
const RESIZE_MAX_DIMENSION = 800;
const JPEG_QUALITY = 80;

async function loadSourceBuffer(data: ImageProcessJobData): Promise<Buffer> {
  if (data.localFilePath) {
    return fs.readFile(data.localFilePath);
  }
  if (data.imageUrl) {
    const response = await fetch(data.imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch source image: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error("No image source provided (localFilePath or imageUrl)");
}

export const processImage = async (job: { data: ImageProcessJobData }) => {
  const { productId, localFilePath, imageUrl } = job.data;
  logger.info(`Processing image for product ${productId}`, {
    imageUrl,
    localFilePath,
  });

  try {
    const sourceBuffer = await loadSourceBuffer(job.data);

    const processedBuffer = await sharp(sourceBuffer)
      .resize(RESIZE_MAX_DIMENSION, RESIZE_MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    await fs.mkdir(PRODUCT_IMAGE_DIR, { recursive: true });
    const filename = `product-${productId}-${Date.now()}.jpg`;
    const filepath = path.join(PRODUCT_IMAGE_DIR, filename);
    await fs.writeFile(filepath, processedBuffer);

    const publicUrl = `/uploads/products/${filename}`;
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { images: true },
    });
    if (product) {
      await prisma.product.update({
        where: { id: productId },
        data: { images: [...product.images, publicUrl] },
      });
    }

    if (localFilePath) {
      await fs.unlink(localFilePath).catch(() => {
        logger.warn(`Failed to delete temp upload file: ${localFilePath}`);
      });
    }

    logger.info(
      `Image processed and linked to product ${productId}: ${publicUrl}`,
    );
    return { processed: true, url: publicUrl };
  } catch (error) {
    logger.error("Image processing failed", { productId, error });
    throw error;
  }
};
