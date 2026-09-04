import { Request, Response } from "express";
import { CheckoutService } from "./checkout.service";
import { asyncHandler } from "@shared/utils/async-handler";

export class CheckoutController {
  constructor(private readonly service: CheckoutService) {}

  checkout = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const result = await this.service.checkout(userId, req.body);
    res.status(201).json({ success: true, data: result });
  });

  getOrders = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const result = await this.service.getOrders(userId, page, limit);
    res.json({ success: true, data: result });
  });

  getOrder = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const { orderId } = req.params;
    const order = await this.service.getOrder(orderId, userId);
    res.json({ success: true, data: order });
  });
}
