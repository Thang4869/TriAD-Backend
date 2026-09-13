import { Request, Response } from "express";
import { CheckoutService } from "./checkout.service";
import { asyncHandler } from "@shared/utils/async-handler";
import { sendSuccess, sendCreated } from "@shared/utils/api-response";

export class CheckoutController {
  constructor(private readonly service: CheckoutService) {}

  checkout = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const result = await this.service.checkout(userId, req.body);
    sendCreated(res, result);
  });

  getOrders = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const result = await this.service.getOrders(userId, page, limit);
    sendSuccess(res, result);
  });

  getOrder = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const { orderId } = req.params;
    const order = await this.service.getOrder(orderId, userId);
    sendSuccess(res, order);
  });
}
