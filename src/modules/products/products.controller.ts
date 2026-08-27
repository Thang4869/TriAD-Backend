import { Request, Response, NextFunction } from "express";
import { IProductsService, ProductsService } from "./products.service";

export class ProductsController {
  constructor(
    private readonly service: IProductsService = new ProductsService(),
  ) {}

  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
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
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const product = await this.service.findById(id);
      res.json({ success: true, data: product });
    } catch (error) {
      next(error);
    }
  };

  getBySlug = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug } = req.params;
      const product = await this.service.getBySlug(slug);
      res.json({ success: true, data: product });
    } catch (error) {
      next(error);
    }
  };

  getCategories = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await this.service.getCategories();
      res.json({ success: true, data: categories });
    } catch (error) {
      next(error);
    }
  };

  // ---------- Admin ----------

  adminGetAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
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
    } catch (error) {
      next(error);
    }
  };

  adminCreate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await this.service.create(req.body);
      res.status(201).json({ success: true, data: product });
    } catch (error) {
      next(error);
    }
  };

  adminUpdate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const product = await this.service.update(id, req.body);
      res.json({ success: true, data: product });
    } catch (error) {
      next(error);
    }
  };

  adminDelete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const product = await this.service.delete(id);
      res.json({
        success: true,
        message: "Product deactivated successfully",
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };

  adminRestore = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const product = await this.service.restore(id);
      res.json({
        success: true,
        message: "Product reactivated successfully",
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };
}