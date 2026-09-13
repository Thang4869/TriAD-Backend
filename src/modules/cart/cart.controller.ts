import { Request, Response } from "express";
import { ICartService } from "./cart.service";
import { BadRequestError } from "@shared/utils/errors";
import { asyncHandler } from "@shared/utils/async-handler";
import { sendSuccess, sendCreated } from "@shared/utils/api-response";

export class CartController {
  constructor(private readonly service: ICartService) {}

  getCart = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const cart = await this.service.getCart(userId);
    sendSuccess(res, cart);
  });

  addItem = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const { productId, quantity } = req.body;
    if (!productId) throw new BadRequestError("productId is required");
    if (!quantity || quantity <= 0)
      throw new BadRequestError("quantity must be greater than 0");
    const item = await this.service.addItem(userId, productId, quantity);
    sendCreated(res, item);
  });

  updateItem = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const { productId } = req.params;
    const { quantity } = req.body;
    if (quantity === undefined || quantity < 0)
      throw new BadRequestError("quantity is required and must be >= 0");
    const result = await this.service.updateItem(userId, productId, quantity);
    sendSuccess(res, result ?? null);
  });

  removeItem = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const { productId } = req.params;
    await this.service.removeItem(userId, productId);
    sendSuccess(res, null);
  });

  clearCart = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const result = await this.service.clearCart(userId);
    sendSuccess(res, result);
  });
}
