import { Router } from "express";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { requireAdmin } from "@shared/middlewares/rbac.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import { uploadProductImage } from "@shared/middlewares/upload.middleware";
import { productsController } from "@/container";
import {
  getProductsQuerySchema,
  getProductParamsSchema,
  getProductBySlugParamsSchema,
  createProductSchema,
  updateProductSchema,
  deleteProductParamsSchema,
  adminGetProductsQuerySchema,
  searchProductsQuerySchema,
} from "./dto/products.dto";

const router = Router();

// Public
router.get("/", validate(getProductsQuerySchema), productsController.getAll);
router.get("/categories", productsController.getCategories);
router.get(
  "/search",
  validate(searchProductsQuerySchema),
  productsController.search,
);
router.get(
  "/slug/:slug",
  validate(getProductBySlugParamsSchema),
  productsController.getBySlug,
);
router.get(
  "/:id",
  validate(getProductParamsSchema),
  productsController.getById,
);

// Admin
router.use("/admin", authMiddleware, requireAdmin);
router.get(
  "/admin/all",
  validate(adminGetProductsQuerySchema),
  productsController.adminGetAll,
);
router.post(
  "/admin",
  validate(createProductSchema),
  productsController.adminCreate,
);
router.put(
  "/admin/:id",
  validate(updateProductSchema),
  productsController.adminUpdate,
);
router.delete(
  "/admin/:id",
  validate(deleteProductParamsSchema),
  productsController.adminDelete,
);
router.patch(
  "/admin/:id/restore",
  validate(deleteProductParamsSchema),
  productsController.adminRestore,
);
router.post(
  "/admin/:id/images",
  validate(deleteProductParamsSchema),
  uploadProductImage,
  productsController.adminUploadImage,
);

export { router as productRoutes };
