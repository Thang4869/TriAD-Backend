import { Request, Response } from "express";
import { CartService, ICartService } from "./cart.service";
import { BadRequestError } from "@shared/utils/errors";
import { asyncHandler } from "@shared/utils/async-handler";

export class CartController {
  constructor(private readonly service: ICartService) {}

  getCart = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const cart = await this.service.getCart(userId);
    res.json({ success: true, data: cart });
  });

  addItem = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { productId, quantity } = req.body;

    if (!productId) {
      throw new BadRequestError("productId is required");
    }
    if (!quantity || quantity <= 0) {
      throw new BadRequestError("quantity must be greater than 0");
    }

    const item = await this.service.addItem(userId, productId, quantity);
    res.status(201).json({ success: true, data: item });
  });

  updateItem = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { productId } = req.params;
    const { quantity } = req.body;

    if (quantity === undefined || quantity < 0) {
      throw new BadRequestError("quantity is required and must be >= 0");
    }

    const result = await this.service.updateItem(userId, productId, quantity);
    res.json({ success: true, data: result ?? null });
  });

  removeItem = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { productId } = req.params;
    await this.service.removeItem(userId, productId);
    res.json({ success: true, data: null });
  });

  clearCart = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const result = await this.service.clearCart(userId);
    res.json({ success: true, data: result });
  });
}
