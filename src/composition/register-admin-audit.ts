import { Lifetime, type Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";
import { PrismaAuditRepository } from "@modules/admin/audit/infrastructure/prisma-audit.repository";
import { AuditService } from "@modules/admin/audit/application/audit.service";
import { AuditController } from "@modules/admin/audit/audit.controller";

export function registerAdminAuditModule(container: Container): void {
  container.register(TOKENS.AuditRepository, () => new PrismaAuditRepository());
  container.register(
    TOKENS.AuditService,
    (c) => new AuditService(c.resolve(TOKENS.AuditRepository)),
  );
  container.register(
    TOKENS.AuditController,
    (c) => new AuditController(c.resolve(TOKENS.AuditService)),
    Lifetime.Transient,
  );
}
