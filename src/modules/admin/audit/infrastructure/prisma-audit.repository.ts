import { Prisma } from "@prisma/client";
import prisma from "@core/database/prisma";
import type { AuditRepository } from "../application/audit.repository.port";
import type {
  AuditEventInput,
  AuditLogFilters,
  AuditLogPage,
} from "../application/audit.types";

export class PrismaAuditRepository implements AuditRepository {
  async create(input: AuditEventInput): Promise<void> {
    await prisma.adminAuditLog.create({
      data: {
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        outcome: input.outcome,
        requestId: input.requestId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async findPage(
    filters: AuditLogFilters,
    page: number,
    limit: number,
  ): Promise<AuditLogPage> {
    const where: Prisma.AdminAuditLogWhereInput = {
      actorId: filters.actorId,
      action: filters.action,
      targetType: filters.targetType,
      targetId: filters.targetId,
      outcome: filters.outcome,
      createdAt:
        filters.from || filters.to
          ? { gte: filters.from, lte: filters.to }
          : undefined,
    };
    const [records, total] = await prisma.$transaction([
      prisma.adminAuditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.adminAuditLog.count({ where }),
    ]);
    return {
      records,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}
