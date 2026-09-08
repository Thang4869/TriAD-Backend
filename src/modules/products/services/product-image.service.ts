import { imageQueue } from "@core/queue/bull";
import { IProductsRepository } from "../products.repository";
import { NotFoundError } from "@shared/utils/errors";

export class ProductImageService {
  constructor(private readonly repository: IProductsRepository) {}

  async upload(productId: string, buffer: Buffer): Promise<{ queued: true }> {
    const exists = await this.repository.existsAndActive(productId);
    if (!exists) throw new NotFoundError("Product not found");

    await imageQueue.add("process-product-image", {
      productId,
      imageBuffer: buffer.toString("base64"),
    });

    return { queued: true };
  }
}
