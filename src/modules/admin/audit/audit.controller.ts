import type { Request, Response } from "express";
import { asyncHandler } from "@shared/utils/async-handler";
import { sendSuccess } from "@shared/utils/api-response";
import { AuditService } from "./application/audit.service";
import type { AuditAction, AuditOutcome } from "./application/audit.types";

export class AuditController {
  constructor(private readonly service: AuditService) {}

  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as Record<string, string | undefined>;
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 50);
    const result = await this.service.query(
      {
        actorId: query.actorId,
        action: query.action as AuditAction | undefined,
        targetType: query.targetType,
        targetId: query.targetId,
        outcome: query.outcome as AuditOutcome | undefined,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      },
      page,
      limit,
    );
    sendSuccess(res, result);
  });
}
