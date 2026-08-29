import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import { json, urlencoded } from "body-parser";

import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "@config/swagger";
import config from "@config";

import { rateLimiter } from "@shared/middlewares/rate-limit.middleware";
import {
  errorHandler,
  notFoundHandler,
} from "@shared/middlewares/error-handler.middleware";
import { authMiddleware } from "@shared/middlewares/auth.middleware";
import { requestLogger } from "@shared/middlewares/logger.middleware";

import { authRoutes } from "@modules/auth/auth.routes";
import { userRoutes } from "@modules/users/users.routes";
import { productRoutes } from "@modules/products/products.routes";
import { cartRoutes } from "@modules/cart/cart.routes";
import { checkoutRoutes } from "@modules/checkout/checkout.routes";
import { orderRoutes } from "@modules/orders/orders.routes";
import { reviewRoutes } from "@modules/reviews/reviews.routes";
import { notificationRoutes } from "@modules/notifications/notifications.routes";
import { wishlistRoutes } from "@modules/wishlist/wishlist.routes";
import { dashboardRoutes } from "@modules/admin/dashboard/dashboard.routes";

import { healthRoutes } from "@core/health/health.routes";
import { metricsMiddleware } from "@core/metrics/metrics.middleware";
import { metricsRoutes } from "@core/metrics/metrics.routes";

const app: Application = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: "deny" },
    noSniff: true,
    xssFilter: true,
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (config.isDevelopment) {
        return callback(null, true);
      }

      const allowedOrigins = config.CORS_ORIGIN;
      if (allowedOrigins.length === 0) {
        return callback(
          new Error("CORS_ORIGIN not configured in production"),
          false,
        );
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (origin.match(/^https?:\/\/localhost:\d+$/)) {
        return callback(null, true);
      }

      callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  }),
);

app.use(compression());
app.use(requestLogger);
app.use(cookieParser());
app.use(metricsMiddleware);

app.use(json({ limit: "10mb" }));
app.use(urlencoded({ extended: true, limit: "10mb" }));

app.use((req, res, next) => {
  const requestId =
    req.headers["x-request-id"] ||
    `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  res.setHeader("x-request-id", requestId);
  (req as any).requestId = requestId;
  next();
});

app.use("/api", rateLimiter());

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
  });
});

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api/auth", authRoutes);
app.use("/api/users", authMiddleware, userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", authMiddleware, cartRoutes);
app.use("/api/checkout", authMiddleware, checkoutRoutes);
app.use("/api/orders", authMiddleware, orderRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/notifications", authMiddleware, notificationRoutes);
app.use("/api/wishlist", authMiddleware, wishlistRoutes);
app.use("/api/admin/dashboard", dashboardRoutes);
app.use("/health", healthRoutes);
app.use("/metrics", metricsRoutes);

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
