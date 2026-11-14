import type { Prisma } from "@prisma/client";

export const AUDIT_OUTCOMES = ["SUCCESS", "FAILURE", "DENIED"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const AUDIT_ACTIONS = {
  PRODUCT_CREATE: "PRODUCT_CREATE",
  PRODUCT_UPDATE: "PRODUCT_UPDATE",
  PRODUCT_DEACTIVATE: "PRODUCT_DEACTIVATE",
  PRODUCT_RESTORE: "PRODUCT_RESTORE",
  PRODUCT_IMAGE_UPLOAD_REQUESTED: "PRODUCT_IMAGE_UPLOAD_REQUESTED",
  PRODUCT_IMAGE_PROCESSING: "PRODUCT_IMAGE_PROCESSING",
  ORDER_STATUS_UPDATE: "ORDER_STATUS_UPDATE",
  REVIEW_ADMIN_DELETE: "REVIEW_ADMIN_DELETE",
  ADMIN_ACTION_DENIED: "ADMIN_ACTION_DENIED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditEventInput {
  actorId?: string;
  actorRole: string;
  action: AuditAction;
  targetType: string;
  targetId?: string;
  requestId: string;
  outcome: AuditOutcome;
  metadata?: Record<string, unknown>;
}

export interface AuditLogFilters {
  actorId?: string;
  action?: AuditAction;
  targetType?: string;
  targetId?: string;
  outcome?: AuditOutcome;
  from?: Date;
  to?: Date;
}

export interface AuditLogPage {
  records: Array<{
    id: string;
    actorId: string | null;
    actorRole: string;
    action: string;
    targetType: string;
    targetId: string | null;
    outcome: string;
    requestId: string;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
  }>;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
