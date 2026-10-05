import type { IProductsRepository } from "../application/ports/products.repository.port";
import { ResourceNotFoundError } from "@shared/errors/application-error";
import { ImageProcessingQueuePort } from "../application/ports/image-processing-queue.port";

export class ProductImageService {
  constructor(
    private readonly repository: IProductsRepository,
    private readonly imageProcessingQueue: ImageProcessingQueuePort,
  ) {}

  async upload(productId: string, buffer: Buffer): Promise<{ queued: true }> {
    const exists = await this.repository.existsAndActive(productId);

    if (!exists) {
      throw new ResourceNotFoundError("Product not found");
    }

    await this.imageProcessingQueue.enqueueProductImage({
      productId,
      imageBuffer: buffer.toString("base64"),
    });

    return { queued: true };
  }
}
