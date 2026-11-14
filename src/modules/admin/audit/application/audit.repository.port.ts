import type {
  AuditEventInput,
  AuditLogFilters,
  AuditLogPage,
} from "./audit.types";

export interface AuditRepository {
  create(input: AuditEventInput): Promise<void>;
  findPage(
    filters: AuditLogFilters,
    page: number,
    limit: number,
  ): Promise<AuditLogPage>;
}
