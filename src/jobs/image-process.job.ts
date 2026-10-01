import sharp from "sharp";
import type { IProductsRepository } from "@modules/products/application/ports/products.repository.port";
import { logger } from "@core/logger/winston";
import type { IImageStorage } from "@core/storage/cloudinary";
import type { EventBus } from "@shared/domain/event-bus/event-bus";
import { ProductUpdatedEvent } from "@shared/domain/events/product-events";

export interface ImageProcessJobData {
  productId: string;
  imageBuffer?: string;
}

const RESIZE_MAX_DIMENSION = 800;
const JPEG_QUALITY = 80;

export const processImage = async (
  job: { data: ImageProcessJobData },
  productsRepository: IProductsRepository,
  storage: IImageStorage,
  eventBus: EventBus,
) => {
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

  const { url } = await storage.upload(
    processedBuffer,
    `products/${productId}`,
  );

  const product = await productsRepository.findById(productId);
  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  await productsRepository.update(productId, {
    images: [...product.images, url],
  });
  await eventBus.publish(new ProductUpdatedEvent(productId));
  logger.info(`Image processed and linked to product ${productId}: ${url}`);
  return { processed: true, url };
};
