export interface EnqueueProductImageInput {
  productId: string;
  imageBuffer: string;
}

export interface ImageProcessingQueuePort {
  enqueueProductImage(input: EnqueueProductImageInput): Promise<void>;
}
