import { logger } from "@core/logger/winston";
import type { Request } from "express";
import type {
  AuditAction,
  AuditEventInput,
  AuditLogFilters,
  AuditLogPage,
  AuditOutcome,
} from "./audit.types";
import type { AuditRepository } from "./audit.repository.port";

const MAX_METADATA_KEYS = 12;
const MAX_METADATA_STRING_LENGTH = 256;
const ALLOWED_METADATA_KEYS = new Set([
  "changedFields",
  "previousStatus",
  "newStatus",
  "queued",
  "jobId",
  "errorCode",
  "reason",
]);
const SECRET_KEY = /(password|token|secret|cookie|authorization|body|buffer)/i;

export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async record(input: AuditEventInput): Promise<void> {
    await this.repository.create({
      ...input,
      metadata: sanitizeMetadata(input.metadata),
    });
  }

  async recordFailureBestEffort(
    input: Omit<AuditEventInput, "outcome">,
    error: unknown,
  ): Promise<void> {
    try {
      await this.record({
        ...input,
        outcome: "FAILURE",
        metadata: {
          ...input.metadata,
          errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
        },
      });
    } catch (auditError) {
      logger.error("Unable to persist failed admin audit event", {
        error:
          auditError instanceof Error ? auditError.message : String(auditError),
        action: input.action,
        requestId: input.requestId,
      });
    }
  }

  async recordDenied(
    req: Request,
    action: string,
    targetId?: string,
  ): Promise<void> {
    const user = req.user as { id: string; role: string } | undefined;
    if (!user || user.role === "ADMIN") return;
    try {
      await this.record({
        actorId: user.id,
        actorRole: user.role,
        action: "ADMIN_ACTION_DENIED",
        targetType: action,
        targetId,
        requestId: req.requestId ?? "missing-request-id",
        outcome: "DENIED",
        metadata: { reason: "insufficient_role" },
      });
    } catch (error) {
      logger.warn("Unable to persist denied admin audit event", {
        error: error instanceof Error ? error.message : String(error),
        requestId: req.requestId,
      });
    }
  }

  async query(
    filters: AuditLogFilters,
    page: number,
    limit: number,
  ): Promise<AuditLogPage> {
    return this.repository.findPage(filters, page, Math.min(limit, 100));
  }

  async recordMutation<T>(
    req: Request,
    input: Omit<
      AuditEventInput,
      "actorId" | "actorRole" | "requestId" | "outcome" | "targetId"
    > & {
      targetId?: string | ((result: T) => string | undefined);
    },
    operation: () => Promise<T>,
  ): Promise<T> {
    const { targetId, ...event } = input;
    const base = {
      ...event,
      actorId: (req.user as { id: string } | undefined)?.id,
      actorRole: (req.user as { role: string } | undefined)?.role ?? "UNKNOWN",
      requestId: req.requestId ?? "missing-request-id",
    };

    try {
      const result = await operation();
      try {
        await this.record({
          ...base,
          targetId:
            typeof targetId === "function" ? targetId(result) : targetId,
          outcome: "SUCCESS",
        });
      } catch (auditError) {
        logger.error(
          "Admin mutation committed but success audit write failed",
          {
            error:
              auditError instanceof Error
                ? auditError.message
                : String(auditError),
            action: base.action,
            targetId: typeof targetId === "string" ? targetId : undefined,
            requestId: base.requestId,
          },
        );
      }
      return result;
    } catch (error) {
      await this.recordFailureBestEffort(base, error);
      throw error;
    }
  }
}

function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (
      Object.keys(result).length >= MAX_METADATA_KEYS ||
      !ALLOWED_METADATA_KEYS.has(key) ||
      SECRET_KEY.test(key)
    ) {
      continue;
    }
    if (typeof value === "string") {
      result[key] = value.slice(0, MAX_METADATA_STRING_LENGTH);
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value
        .filter((entry): entry is string => typeof entry === "string")
        .slice(0, 20)
        .map((entry) => entry.slice(0, MAX_METADATA_STRING_LENGTH));
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function auditRequestContext(
  req: Request,
): Pick<AuditEventInput, "actorId" | "actorRole" | "requestId"> {
  return {
    actorId: (req.user as { id: string } | undefined)?.id,
    actorRole: (req.user as { role: string } | undefined)?.role ?? "UNKNOWN",
    requestId: req.requestId ?? "missing-request-id",
  };
}

export type { AuditAction, AuditOutcome };
