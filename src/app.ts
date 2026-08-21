import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { json, urlencoded } from 'body-parser';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from '@config/swagger';

// Middlewares
import { rateLimiter, strictRateLimiter } from '@shared/middlewares/rate-limit.middleware';
import { errorHandler, notFoundHandler } from '@shared/middlewares/error-handler.middleware';
import { authMiddleware } from '@shared/middlewares/auth.middleware';
import { idempotencyMiddleware } from '@shared/middlewares/idempotency.middleware';

// Routes
import { authRoutes } from '@modules/auth/auth.routes';
import { userRoutes } from '@modules/users/users.routes';
import { productRoutes } from '@modules/products/products.routes';
import { cartRoutes } from '@modules/cart/cart.routes';
import { checkoutRoutes } from '@modules/checkout/checkout.routes';
import { orderRoutes } from '@modules/orders/orders.routes';
import { reviewRoutes } from '@modules/reviews/reviews.routes';
import { notificationRoutes } from '@modules/notifications/notifications.routes';

const app: Application = express();

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || true,
  credentials: true,
}));

// Compression
app.use(compression());

// Body parsing
app.use(json({ limit: '10mb' }));
app.use(urlencoded({ extended: true, limit: '10mb' }));

// Global rate limiter
app.use(rateLimiter());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Swagger API docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', authMiddleware, cartRoutes);
app.use('/api/checkout', authMiddleware, idempotencyMiddleware(), checkoutRoutes);
app.use('/api/orders', authMiddleware, orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', authMiddleware, notificationRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;