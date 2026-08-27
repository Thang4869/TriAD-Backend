import { Request, Response, NextFunction } from "express";
import { CartService, ICartService } from "./cart.service";
import { BadRequestError } from "@shared/utils/errors";

export class CartController {
  constructor(
    private readonly service: ICartService = new CartService(),
  ) {}

  getCart = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const cart = await this.service.getCart(userId);
      res.json({ success: true, data: cart });
    } catch (error) {
      next(error);
    }
  };

  addItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
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
    } catch (error) {
      next(error);
    }
  };

  updateItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { productId } = req.params;
      const { quantity } = req.body;

      if (quantity === undefined || quantity < 0) {
        throw new BadRequestError("quantity is required and must be >= 0");
      }

      const result = await this.service.updateItem(userId, productId, quantity);
      res.json({ success: true, data: result ?? null });
    } catch (error) {
      next(error);
    }
  };

  removeItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { productId } = req.params;
      await this.service.removeItem(userId, productId);
      res.json({ success: true, data: null });
    } catch (error) {
      next(error);
    }
  };

  clearCart = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const result = await this.service.clearCart(userId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };
}