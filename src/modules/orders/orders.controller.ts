import { Request, Response, NextFunction } from "express";
import { OrdersService } from "./orders.service";
import { ForbiddenError } from "@shared/utils/errors";
import { OrderStatus } from "@prisma/client";

const ordersService = new OrdersService();

export class OrdersController {
  async getMyOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const result = await ordersService.getOrders(userId, page, limit);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { orderId } = req.params;
      const order = await ordersService.getOrderById(orderId, userId);
      res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  async adminGetOrders(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role !== "ADMIN") {
        throw new ForbiddenError("Admin access required");
      }
      const { status, userId } = req.query;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const result = await ordersService.adminGetOrders(
        { status, userId },
        page,
        limit,
      );
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async adminUpdateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role !== "ADMIN") {
        throw new ForbiddenError("Admin access required");
      }
      const { orderId } = req.params;
      const { status } = req.body;
      if (!status || !Object.values(OrderStatus).includes(status)) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid status" });
      }
      const updated = await ordersService.updateOrderStatus(orderId, status);
      res.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
}
