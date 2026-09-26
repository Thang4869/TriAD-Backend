import { imageQueue } from "@core/queue/bull";
import {
  EnqueueProductImageInput,
  ImageProcessingQueuePort,
} from "@modules/products/application/ports/image-processing-queue.port";

export class BullMqImageProcessingQueue implements ImageProcessingQueuePort {
  async enqueueProductImage(input: EnqueueProductImageInput): Promise<void> {
    await imageQueue.add("process-product-image", input);
  }
}
