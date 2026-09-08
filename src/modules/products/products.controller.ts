import { Request, Response } from "express";
import { CatalogService } from "./services/catalog.service";
import { AdminProductService } from "./services/admin-product.service";
import { asyncHandler } from "@shared/utils/async-handler";
import { BadRequestError } from "@shared/utils/errors";

export class ProductsController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly adminService: AdminProductService,
  ) {}

  // Public endpoints
  getAll = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.catalogService.findAll(req.query);
    res.json({ success: true, data: result });
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const product = await this.catalogService.findById(req.params.id);
    res.json({ success: true, data: product });
  });

  getBySlug = asyncHandler(async (req: Request, res: Response) => {
    const product = await this.catalogService.getBySlug(req.params.slug);
    res.json({ success: true, data: product });
  });

  getCategories = asyncHandler(async (_req: Request, res: Response) => {
    const categories = await this.catalogService.getCategories();
    res.json({ success: true, data: categories });
  });

  search = asyncHandler(async (req: Request, res: Response) => {
    const { q, page, limit } = req.query;
    const result = await this.catalogService.search(
      q as string,
      Number(page),
      Number(limit),
    );
    res.json({ success: true, data: result });
  });

  // Admin endpoints
  adminGetAll = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.adminService.adminFindAll(req.query);
    res.json({ success: true, data: result });
  });

  adminCreate = asyncHandler(async (req: Request, res: Response) => {
    const product = await this.adminService.create(req.body);
    res.status(201).json({ success: true, data: product });
  });

  adminUpdate = asyncHandler(async (req: Request, res: Response) => {
    const product = await this.adminService.update(req.params.id, req.body);
    res.json({ success: true, data: product });
  });

  adminDelete = asyncHandler(async (req: Request, res: Response) => {
    const product = await this.adminService.delete(req.params.id);
    res.json({
      success: true,
      message: "Product deactivated successfully",
      data: product,
    });
  });

  adminRestore = asyncHandler(async (req: Request, res: Response) => {
    const product = await this.adminService.restore(req.params.id);
    res.json({
      success: true,
      message: "Product reactivated successfully",
      data: product,
    });
  });

  adminUploadImage = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new BadRequestError("Image file is required");
    const result = await this.adminService.uploadImage(
      req.params.id,
      req.file.buffer,
    );
    res.status(202).json({
      success: true,
      message: "Image queued for processing",
      data: result,
    });
  });
}
