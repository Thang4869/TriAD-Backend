import { Request, Response, NextFunction } from "express";
import { CartService } from "./cart.service";
import { BadRequestError } from "@shared/utils/errors";

const cartService = new CartService();

export class CartController {
  async getCart(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const cart = await cartService.getCart(userId);
      res.json({
        success: true,
        data: cart,
      });
    } catch (error) {
      next(error);
    }
  }

  async addItem(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { productId, quantity } = req.body;

      if (!productId) {
        throw new BadRequestError("productId is required");
      }
      if (!quantity || quantity <= 0) {
        throw new BadRequestError("quantity must be greater than 0");
      }

      const item = await cartService.addItem(userId, productId, quantity);
      res.status(201).json({
        success: true,
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateItem(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { productId } = req.params;
      const { quantity } = req.body;

      if (quantity === undefined || quantity < 0) {
        throw new BadRequestError("quantity is required and must be >= 0");
      }

      const result = await cartService.updateItem(userId, productId, quantity);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async removeItem(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { productId } = req.params;
      const result = await cartService.removeItem(userId, productId);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async clearCart(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const result = await cartService.clearCart(userId);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
