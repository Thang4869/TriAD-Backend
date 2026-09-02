import { Request, Response } from "express";
import { IWishlistService, WishlistService } from "./wishlist.service";
import { asyncHandler } from "@shared/utils/async-handler";

export class WishlistController {
  constructor(private readonly service: IWishlistService) {}

  getWishlist = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await this.service.getWishlist(userId, page, limit);
    res.json({ success: true, data: result });
  });

  addItem = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { productId } = req.body;
    const item = await this.service.addItem(userId, productId);
    res.status(201).json({ success: true, data: item });
  });

  removeItem = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { productId } = req.params;
    await this.service.removeItem(userId, productId);
    res.json({ success: true, data: null });
  });
}
