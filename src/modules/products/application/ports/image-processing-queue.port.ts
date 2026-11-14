export interface EnqueueProductImageInput {
  productId: string;
  imageBuffer: string;
  actorId?: string;
  actorRole?: string;
  requestId?: string;
}

export interface ImageProcessingQueuePort {
  enqueueProductImage(input: EnqueueProductImageInput): Promise<void>;
}
