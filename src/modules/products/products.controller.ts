import { Request, Response } from "express";
import { CatalogService } from "./services/catalog.service";
import { AdminProductService } from "./services/admin-product.service";
import { asyncHandler } from "@shared/utils/async-handler";
import { ValidationError } from "@shared/errors/application-error";
import {
  sendSuccess,
  sendCreated,
  sendAccepted,
} from "@shared/utils/api-response";
import { AuditService } from "@modules/admin/audit/application/audit.service";
import { AUDIT_ACTIONS } from "@modules/admin/audit/application/audit.types";

export class ProductsController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly adminService: AdminProductService,
    private readonly auditService?: AuditService,
  ) {}

  getAll = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.catalogService.findAll(req.query);
    sendSuccess(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const product = await this.catalogService.findById(req.params.id);
    sendSuccess(res, product);
  });

  getBySlug = asyncHandler(async (req: Request, res: Response) => {
    const product = await this.catalogService.getBySlug(req.params.slug);
    sendSuccess(res, product);
  });

  getCategories = asyncHandler(async (_req: Request, res: Response) => {
    const categories = await this.catalogService.getCategories();
    sendSuccess(res, categories);
  });

  search = asyncHandler(async (req: Request, res: Response) => {
    const { q, page, limit } = req.query;
    const result = await this.catalogService.search(
      q as string,
      Number(page),
      Number(limit),
    );
    sendSuccess(res, result);
  });

  adminGetAll = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.adminService.adminFindAll(req.query);
    sendSuccess(res, result);
  });

  adminCreate = asyncHandler(async (req: Request, res: Response) => {
    const product = this.auditService
      ? await this.auditService.recordMutation(
          req,
          {
            action: AUDIT_ACTIONS.PRODUCT_CREATE,
            targetType: "PRODUCT",
            targetId: (result) => result.id,
            metadata: { changedFields: Object.keys(req.body) },
          },
          () => this.adminService.create(req.body),
        )
      : await this.adminService.create(req.body);
    sendCreated(res, product);
  });

  adminUpdate = asyncHandler(async (req: Request, res: Response) => {
    const product = this.auditService
      ? await this.auditService.recordMutation(
          req,
          {
            action: AUDIT_ACTIONS.PRODUCT_UPDATE,
            targetType: "PRODUCT",
            targetId: req.params.id,
            metadata: { changedFields: Object.keys(req.body) },
          },
          () => this.adminService.update(req.params.id, req.body),
        )
      : await this.adminService.update(req.params.id, req.body);
    sendSuccess(res, product);
  });

  adminDelete = asyncHandler(async (req: Request, res: Response) => {
    const product = this.auditService
      ? await this.auditService.recordMutation(
          req,
          {
            action: AUDIT_ACTIONS.PRODUCT_DEACTIVATE,
            targetType: "PRODUCT",
            targetId: req.params.id,
          },
          () => this.adminService.delete(req.params.id),
        )
      : await this.adminService.delete(req.params.id);
    sendSuccess(res, product, "Product deactivated successfully");
  });

  adminRestore = asyncHandler(async (req: Request, res: Response) => {
    const product = this.auditService
      ? await this.auditService.recordMutation(
          req,
          {
            action: AUDIT_ACTIONS.PRODUCT_RESTORE,
            targetType: "PRODUCT",
            targetId: req.params.id,
          },
          () => this.adminService.restore(req.params.id),
        )
      : await this.adminService.restore(req.params.id);
    sendSuccess(res, product, "Product reactivated successfully");
  });

  adminUploadImage = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new ValidationError("Image file is required");
    const operation = () => {
      const context = {
        actorId: (req.user as { id: string } | undefined)?.id,
        actorRole: (req.user as { role: string } | undefined)?.role,
        requestId: req.requestId,
      };
      return context.actorId || context.actorRole || context.requestId
        ? this.adminService.uploadImage(
            req.params.id,
            req.file!.buffer,
            context,
          )
        : this.adminService.uploadImage(req.params.id, req.file!.buffer);
    };
    const result = this.auditService
      ? await this.auditService.recordMutation(
          req,
          {
            action: AUDIT_ACTIONS.PRODUCT_IMAGE_UPLOAD_REQUESTED,
            targetType: "PRODUCT",
            targetId: req.params.id,
            metadata: { queued: true },
          },
          operation,
        )
      : await operation();
    sendAccepted(res, result, "Image queued for processing");
  });
}
