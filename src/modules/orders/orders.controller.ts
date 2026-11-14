import { Request, Response } from "express";
import { IOrdersService } from "./orders.service";
import { AuthorizationError } from "@shared/errors/application-error";
import { OrderStatus } from "./domain/order-status";
import { ROLES, Role } from "@shared/types/roles";
import { asyncHandler } from "@shared/utils/async-handler";
import { sendSuccess } from "@shared/utils/api-response";
import { AuditService } from "@modules/admin/audit/application/audit.service";
import { AUDIT_ACTIONS } from "@modules/admin/audit/application/audit.types";

export class OrdersController {
  constructor(
    private readonly service: IOrdersService,
    private readonly auditService?: AuditService,
  ) {}

  getMyOrders = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const result = await this.service.getOrders(userId, page, limit);
    sendSuccess(res, result);
  });

  getMyOrder = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req.user as { id: string }).id;
    const { orderId } = req.params;
    const order = await this.service.getOrderById(orderId, userId);
    sendSuccess(res, order);
  });

  adminGetOrders = asyncHandler(async (req: Request, res: Response) => {
    if ((req.user as { role?: Role })?.role !== ROLES.ADMIN) {
      throw new AuthorizationError("Admin access required");
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
    sendSuccess(res, result);
  });

  adminUpdateStatus = asyncHandler(async (req: Request, res: Response) => {
    if ((req.user as { role?: Role })?.role !== ROLES.ADMIN) {
      throw new AuthorizationError("Admin access required");
    }
    const { orderId } = req.params;
    const { status } = req.body;
    if (!status || !Object.values(OrderStatus).includes(status)) {
      res.status(400).json({ success: false, error: "Invalid status" });
      return;
    }
    const operation = () => this.service.updateOrderStatus(orderId, status);
    const updated = this.auditService
      ? await this.auditService.recordMutation(
          req,
          {
            action: AUDIT_ACTIONS.ORDER_STATUS_UPDATE,
            targetType: "ORDER",
            targetId: orderId,
            metadata: { newStatus: status },
          },
          operation,
        )
      : await operation();
    sendSuccess(res, updated);
  });
}
