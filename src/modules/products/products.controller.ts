import { Request, Response } from "express";
import { CatalogService } from "./services/catalog.service";
import { AdminProductService } from "./services/admin-product.service";
import { asyncHandler } from "@shared/utils/async-handler";
import { BadRequestError } from "@shared/utils/errors";
import {
  sendSuccess,
  sendCreated,
  sendAccepted,
} from "@shared/utils/api-response";

export class ProductsController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly adminService: AdminProductService,
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
    const product = await this.adminService.create(req.body);
    sendCreated(res, product);
  });

  adminUpdate = asyncHandler(async (req: Request, res: Response) => {
    const product = await this.adminService.update(req.params.id, req.body);
    sendSuccess(res, product);
  });

  adminDelete = asyncHandler(async (req: Request, res: Response) => {
    const product = await this.adminService.delete(req.params.id);
    sendSuccess(res, product, "Product deactivated successfully");
  });

  adminRestore = asyncHandler(async (req: Request, res: Response) => {
    const product = await this.adminService.restore(req.params.id);
    sendSuccess(res, product, "Product reactivated successfully");
  });

  adminUploadImage = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new BadRequestError("Image file is required");
    const result = await this.adminService.uploadImage(
      req.params.id,
      req.file.buffer,
    );
    sendAccepted(res, result, "Image queued for processing");
  });
}
