import { Request, Response } from "express";
import { IWishlistService } from "./wishlist.service";
import { asyncHandler } from "@shared/utils/async-handler";
import { sendSuccess, sendCreated } from "@shared/utils/api-response";

export class WishlistController {
  constructor(private readonly service: IWishlistService) {}

  getWishlist = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await this.service.getWishlist(userId, page, limit);
    sendSuccess(res, result);
  });

  addItem = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const { productId } = req.body;
    const item = await this.service.addItem(userId, productId);
    sendCreated(res, item);
  });

  removeItem = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const { productId } = req.params;
    await this.service.removeItem(userId, productId);
    sendSuccess(res, null);
  });
}
