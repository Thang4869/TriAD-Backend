import { Request, Response, NextFunction } from "express";
import { CheckoutService } from "./checkout.service";

export class CheckoutController {
  constructor(
    private readonly service: CheckoutService = new CheckoutService(),
  ) {}

  checkout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const result = await this.service.checkout(userId, req.body);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  getOrders = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const result = await this.service.getOrders(userId, page, limit);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  getOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { orderId } = req.params;
      const order = await this.service.getOrder(orderId, userId);
      res.json({ success: true, data: order });
    } catch (error) {
      next(error);
    }
  };
}