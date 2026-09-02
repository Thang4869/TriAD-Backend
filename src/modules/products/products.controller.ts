import { Request, Response } from "express";
import { IProductsService, ProductsService } from "./products.service";
import { asyncHandler } from "@shared/utils/async-handler";
import { BadRequestError } from "@shared/utils/errors";

export class ProductsController {
  constructor(private readonly service: IProductsService) {}

  getAll = asyncHandler(async (req: Request, res: Response) => {
    const {
      page,
      limit,
      category,
      minPrice,
      maxPrice,
      keyword,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await this.service.findAll({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      category: category as string,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      keyword: keyword as string,
      sortBy: sortBy as string,
      sortOrder: sortOrder as "asc" | "desc" | undefined,
    });

    res.json({ success: true, data: result });
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const product = await this.service.findById(id);
    res.json({ success: true, data: product });
  });

  getBySlug = asyncHandler(async (req: Request, res: Response) => {
    const { slug } = req.params;
    const product = await this.service.getBySlug(slug);
    res.json({ success: true, data: product });
  });

  getCategories = asyncHandler(async (_req: Request, res: Response) => {
    const categories = await this.service.getCategories();
    res.json({ success: true, data: categories });
  });

  search = asyncHandler(async (req: Request, res: Response) => {
    const { q, page, limit } = req.query as {
      q: string;
      page?: string;
      limit?: string;
    };
    const result = await this.service.search(
      q,
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
    );
    res.json({ success: true, data: result });
  });

  // ---------- Admin ----------

  adminGetAll = asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, category, keyword, isActive, sortBy, sortOrder } =
      req.query as Record<string, string | undefined>;

    const result = await this.service.adminFindAll({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      category,
      keyword,
      isActive: isActive === undefined ? undefined : isActive === "true",
      sortBy,
      sortOrder: sortOrder as "asc" | "desc" | undefined,
    });

    res.json({ success: true, data: result });
  });

  adminCreate = asyncHandler(async (req: Request, res: Response) => {
    const product = await this.service.create(req.body);
    res.status(201).json({ success: true, data: product });
  });

  adminUpdate = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const product = await this.service.update(id, req.body);
    res.json({ success: true, data: product });
  });

  adminDelete = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const product = await this.service.delete(id);
    res.json({
      success: true,
      message: "Product deactivated successfully",
      data: product,
    });
  });

  adminRestore = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const product = await this.service.restore(id);
    res.json({
      success: true,
      message: "Product reactivated successfully",
      data: product,
    });
  });

  adminUploadImage = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!req.file) {
      throw new BadRequestError("Image file is required (field name: 'image')");
    }
    const result = await this.service.uploadImage(id, req.file.buffer);
    res.status(202).json({
      success: true,
      message: "Image queued for processing",
      data: result,
    });
  });
}
