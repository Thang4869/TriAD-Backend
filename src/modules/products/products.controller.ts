import { Request, Response, NextFunction } from "express";
import { ProductsService } from "./products.service";

const productsService = new ProductsService();

export class ProductsController {
  async getAll(req: Request, res: Response, next: NextFunction) {
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

      const result = await productsService.findAll({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        category: category as string,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        keyword: keyword as string,
        sortBy: sortBy as string,
        sortOrder: sortOrder as "asc" | "desc" | undefined,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const product = await productsService.findById(id);
      res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  async getBySlug(req: Request, res: Response, next: NextFunction) {
    try {
      const { slug } = req.params;
      const product = await productsService.getBySlug(slug);
      res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  async getCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const categories = await productsService.getCategories();
      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------- Admin ----------

  async adminGetAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, category, keyword, isActive, sortBy, sortOrder } =
        req.query as Record<string, string | undefined>;

      const result = await productsService.adminFindAll({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        category,
        keyword,
        isActive: isActive === undefined ? undefined : isActive === "true",
        sortBy,
        sortOrder: sortOrder as "asc" | "desc" | undefined,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async adminCreate(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await productsService.create(req.body);
      res.status(201).json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  async adminUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const product = await productsService.update(id, req.body);
      res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  async adminDelete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const product = await productsService.delete(id);
      res.json({
        success: true,
        message: "Product deactivated successfully",
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  async adminRestore(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const product = await productsService.restore(id);
      res.json({
        success: true,
        message: "Product reactivated successfully",
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }
}