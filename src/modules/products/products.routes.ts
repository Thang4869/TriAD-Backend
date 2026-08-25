import { Router } from "express";
import { ProductsController } from "./products.controller";
import { validate } from "@shared/middlewares/validation.middleware";
import { 
    getProductsQuerySchema, 
    getProductParamsSchema, 
    getProductBySlugParamsSchema 
} from "./dto/query-product.dto";

const router = Router();
const controller = new ProductsController();

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get list of products with filtering and pagination
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 12 }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: minPrice
 *         schema: { type: number }
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number }
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [createdAt, price, name, rating] }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc] }
 *     responses:
 *       200:
 *         description: List of products
 */
router.get(
    "/", 
    validate(getProductsQuerySchema), 
    controller.getAll.bind(controller)
);

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Get product by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product details
 *       404:
 *         description: Product not found
 */
router.get(
    "/:id",
    validate(getProductParamsSchema),
    controller.getById.bind(controller)
);

/**
 * @swagger
 * /api/products/slug/{slug}:
 *   get:
 *     summary: Get product by slug
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product details
 *       404:
 *         description: Product not found
 */
router.get(
    "/slug/:slug",
    validate(getProductBySlugParamsSchema),
    controller.getBySlug.bind(controller)
);

/**
 * @swagger
 * /api/products/categories:
 *   get:
 *     summary: Get all product categories with counts
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: List of categories
 */
router.get(
    "/categories",
    controller.getCategories.bind(controller)
);

export { router as productRoutes };
