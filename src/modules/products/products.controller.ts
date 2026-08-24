import { Request, Response, NextFunction } from "express";
import { ProductsService } from "./products.service";
import { BadRequestError } from "@shared/utils/errors";

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
}
