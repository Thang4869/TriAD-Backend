import sharp from "sharp";
import prisma from "@core/database/prisma";
import { logger } from "@core/logger/winston";
import { CloudinaryImageStorage } from "@core/storage/cloudinary";

export interface ImageProcessJobData {
  productId: string;
  imageBuffer?: string;
}

const RESIZE_MAX_DIMENSION = 800;
const JPEG_QUALITY = 80;

export const processImage = async (job: { data: ImageProcessJobData }) => {
  const { productId, imageBuffer } = job.data;
  logger.info(`Processing image for product ${productId}`);

  if (!imageBuffer) {
    throw new Error("No image buffer provided");
  }

  const sourceBuffer = Buffer.from(imageBuffer, "base64");

  const processedBuffer = await sharp(sourceBuffer)
    .resize(RESIZE_MAX_DIMENSION, RESIZE_MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  const storage = new CloudinaryImageStorage();
  const { url } = await storage.upload(
    processedBuffer,
    `products/${productId}`,
  );

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { images: true },
  });
  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  await prisma.product.update({
    where: { id: productId },
    data: { images: [...product.images, url] },
  });

  logger.info(`Image processed and linked to product ${productId}: ${url}`);
  return { processed: true, url };
};
