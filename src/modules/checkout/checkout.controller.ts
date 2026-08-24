import { Request, Response, NextFunction } from "express";
import { CheckoutService } from "./checkout.service";
import { BadRequestError } from "@shared/utils/errors";

const checkoutService = new CheckoutService();

export class CheckoutController {
  async checkout(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { paymentMethod, address, phone, notes, discountCode } = req.body;
      const idempotencyKey =
        req.body.idempotencyKey || (req.headers["idempotency-key"] as string);

      if (!paymentMethod || !address || !phone) {
        throw new BadRequestError(
          "paymentMethod, address and phone are required",
        );
      }

      const result = await checkoutService.checkout(userId, {
        idempotencyKey,
        paymentMethod,
        address,
        phone,
        notes,
        discountCode,
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const result = await checkoutService.getOrders(userId, page, limit);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { orderId } = req.params;
      const order = await checkoutService.getOrder(orderId, userId);
      res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }
}
