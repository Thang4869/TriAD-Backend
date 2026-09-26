import { IProductsRepository } from "../products.repository";
import { NotFoundError } from "@shared/utils/errors";
import { ImageProcessingQueuePort } from "../application/ports/image-processing-queue.port";

export class ProductImageService {
  constructor(
    private readonly repository: IProductsRepository,
    private readonly imageProcessingQueue: ImageProcessingQueuePort,
  ) {}

  async upload(productId: string, buffer: Buffer): Promise<{ queued: true }> {
    const exists = await this.repository.existsAndActive(productId);

    if (!exists) {
      throw new NotFoundError("Product not found");
    }

    await this.imageProcessingQueue.enqueueProductImage({
      productId,
      imageBuffer: buffer.toString("base64"),
    });

    return { queued: true };
  }
}
