import { Request, Response } from "express";
import { IOrdersService } from "./orders.service";
import { ForbiddenError } from "@shared/utils/errors";
import { OrderStatus } from "@prisma/client";
import { asyncHandler } from "@shared/utils/async-handler";

export class OrdersController {
  constructor(private readonly service: IOrdersService) {}

  getMyOrders = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const result = await this.service.getOrders(userId, page, limit);
    res.json({ success: true, data: result });
  });

  getMyOrder = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { orderId } = req.params;
    const order = await this.service.getOrderById(orderId, userId);
    res.json({ success: true, data: order });
  });

  adminGetOrders = asyncHandler(async (req: Request, res: Response) => {
    if (req.user?.role !== "ADMIN") {
      throw new ForbiddenError("Admin access required");
    }
    const { status, userId } = req.query as {
      status?: OrderStatus;
      userId?: string;
    };
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const result = await this.service.adminGetOrders(
      { status, userId },
      page,
      limit,
    );
    res.json({ success: true, data: result });
  });

  adminUpdateStatus = asyncHandler(async (req: Request, res: Response) => {
    if (req.user?.role !== "ADMIN") {
      throw new ForbiddenError("Admin access required");
    }
    const { orderId } = req.params;
    const { status } = req.body;
    if (!status || !Object.values(OrderStatus).includes(status)) {
      res.status(400).json({ success: false, error: "Invalid status" });
      return;
    }
    const updated = await this.service.updateOrderStatus(orderId, status);
    res.json({ success: true, data: updated });
  });
}
