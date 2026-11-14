import sharp from "sharp";
import type { IProductsRepository } from "@modules/products/application/ports/products.repository.port";
import { Product } from "@modules/products/domain/product.entity";
import { logger } from "@core/logger/winston";
import type { IImageStorage } from "@core/storage/cloudinary";
import type { AuditService } from "@modules/admin/audit/application/audit.service";
import { AUDIT_ACTIONS } from "@modules/admin/audit/application/audit.types";

export interface ImageProcessJobData {
  productId: string;
  imageBuffer?: string;
  actorId?: string;
  actorRole?: string;
  requestId?: string;
}

const RESIZE_MAX_DIMENSION = 800;
const JPEG_QUALITY = 80;

export const processImage = async (
  job: { data: ImageProcessJobData },
  productsRepository: IProductsRepository,
  storage: IImageStorage,
  auditService?: AuditService,
) => {
  const { productId, imageBuffer, actorId, actorRole, requestId } = job.data;
  logger.info(`Processing image for product ${productId}`);

  const auditBase = {
    actorId,
    actorRole: actorRole ?? "UNKNOWN",
    action: AUDIT_ACTIONS.PRODUCT_IMAGE_PROCESSING,
    targetType: "PRODUCT",
    targetId: productId,
    requestId: requestId ?? `image-job-${productId}`,
  } as const;

  try {
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

    const entity = Product.hydrate(product);
    entity.markUpdated();
    await productsRepository.updateWithEvents(
      productId,
      { images: [...product.images, url] },
      entity,
    );
    if (auditService) {
      try {
        await auditService.record({
          ...auditBase,
          outcome: "SUCCESS",
        });
      } catch (auditError) {
        logger.error(
          "Image processing committed but success audit write failed",
          {
            error:
              auditError instanceof Error
                ? auditError.message
                : String(auditError),
            productId,
            requestId: auditBase.requestId,
          },
        );
      }
    }
    logger.info(`Image processed and linked to product ${productId}: ${url}`);
    return { processed: true, url };
  } catch (error) {
    if (auditService) {
      await auditService.recordFailureBestEffort(auditBase, error);
    }
    throw error;
  }
};
