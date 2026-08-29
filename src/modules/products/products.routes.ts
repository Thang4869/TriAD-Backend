import { Router } from "express";
import { ProductsController } from "./products.controller";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { requireAdmin } from "@shared/middlewares/rbac.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import { uploadProductImage } from "@shared/middlewares/upload.middleware";
import { getProductsQuerySchema, getProductParamsSchema, getProductBySlugParamsSchema} from "./dto/products.dto";
import { createProductSchema, updateProductSchema, deleteProductParamsSchema} from "./dto/products.dto";
import { adminGetProductsQuerySchema, searchProductsQuerySchema } from "./dto/products.dto";

const router = Router();
const controller = new ProductsController();

// ---------- Public routes ----------

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
 * /api/products/categories:
 *   get:
 *     summary: Get all product categories with counts
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: List of categories
 */
router.get("/categories", controller.getCategories.bind(controller));

// ---------- Admin routes ----------

router.use("/admin", authMiddleware, requireAdmin);

/**
 * @swagger
 * /api/products/admin/all:
 *   get:
 *     summary: Get all products (including inactive) for admin management
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: List of products
 *       403:
 *         description: Forbidden - admin only
 */
router.get(
  "/admin/all",
  validate(adminGetProductsQuerySchema),
  controller.adminGetAll.bind(controller)
);

/**
 * @swagger
 * /api/products/admin:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - price
 *               - stock
 *               - category
 *               - images
 *               - slug
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               price: { type: number }
 *               stock: { type: integer }
 *               category: { type: string }
 *               images:
 *                 type: array
 *                 items: { type: string }
 *               slug: { type: string }
 *     responses:
 *       201:
 *         description: Product created
 *       400:
 *         description: Validation error or slug already exists
 */
router.post(
  "/admin",
  validate(createProductSchema),
  controller.adminCreate.bind(controller)
);

/**
 * @swagger
 * /api/products/admin/{id}:
 *   put:
 *     summary: Update a product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product updated
 *       404:
 *         description: Product not found
 */
router.put(
  "/admin/:id",
  validate(updateProductSchema),
  controller.adminUpdate.bind(controller)
);

/**
 * @swagger
 * /api/products/admin/{id}:
 *   delete:
 *     summary: Soft-delete (deactivate) a product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product deactivated
 *       404:
 *         description: Product not found
 */
router.delete(
  "/admin/:id",
  validate(deleteProductParamsSchema),
  controller.adminDelete.bind(controller)
);

/**
 * @swagger
 * /api/products/admin/{id}/restore:
 *   patch:
 *     summary: Reactivate a soft-deleted product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product reactivated
 *       404:
 *         description: Product not found
 */
router.patch(
  "/admin/:id/restore",
  validate(deleteProductParamsSchema),
  controller.adminRestore.bind(controller)
);

// ---------- Public routes ----------

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
 * /api/products/admin/{id}/images:
 *   post:
 *     summary: Upload a product image (queued for async processing)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       202:
 *         description: Image accepted and queued
 *       400:
 *         description: Invalid file
 *       404:
 *         description: Product not found
 */
router.post(
  "/admin/:id/images",
  validate(deleteProductParamsSchema),
  uploadProductImage,
  controller.adminUploadImage.bind(controller),
);

/**
 * @swagger
 * /api/products/search:
 *   get:
 *     summary: Full-text search products (Postgres tsvector, ranked)
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, minLength: 2 }
 *     responses:
 *       200:
 *         description: Ranked search results
 */
router.get(
  "/search",
  validate(searchProductsQuerySchema),
  controller.search.bind(controller),
);

export { router as productRoutes };