import { Router } from "express";
import { authMiddleware, auditDeniedAdminAttempt } from "@/container";
import { requireAdmin } from "@shared/middlewares/rbac.middleware";
import { validate } from "@shared/middlewares/validation.middleware";
import {
  uploadProductImage,
  validateUploadedImage,
} from "@shared/middlewares/upload.middleware";
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
router.use("/admin", authMiddleware);
router.get(
  "/admin/all",
  requireAdmin,
  validate(adminGetProductsQuerySchema),
  productsController.adminGetAll,
);
router.post(
  "/admin",
  auditDeniedAdminAttempt("PRODUCT_CREATE"),
  requireAdmin,
  validate(createProductSchema),
  productsController.adminCreate,
);
router.put(
  "/admin/:id",
  auditDeniedAdminAttempt("PRODUCT_UPDATE"),
  requireAdmin,
  validate(updateProductSchema),
  productsController.adminUpdate,
);
router.delete(
  "/admin/:id",
  auditDeniedAdminAttempt("PRODUCT_DEACTIVATE"),
  requireAdmin,
  validate(deleteProductParamsSchema),
  productsController.adminDelete,
);
router.patch(
  "/admin/:id/restore",
  auditDeniedAdminAttempt("PRODUCT_RESTORE"),
  requireAdmin,
  validate(deleteProductParamsSchema),
  productsController.adminRestore,
);
router.post(
  "/admin/:id/images",
  auditDeniedAdminAttempt("PRODUCT_IMAGE_UPLOAD_REQUESTED"),
  requireAdmin,
  validate(deleteProductParamsSchema),
  uploadProductImage,
  validateUploadedImage,
  productsController.adminUploadImage,
);

export { router as productRoutes };
