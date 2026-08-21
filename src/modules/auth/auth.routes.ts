import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validate } from '@shared/middlewares/validation.middleware';
import { registerSchema, loginSchema, refreshSchema } from './dto';
import { authMiddleware } from '@shared/middlewares/auth.middleware';

const router = Router();
const controller = new AuthController();

router.post('/register', validate(registerSchema), controller.register.bind(controller));
router.post('/login', validate(loginSchema), controller.login.bind(controller));
router.post('/refresh', validate(refreshSchema), controller.refresh.bind(controller));
router.post('/logout', authMiddleware, controller.logout.bind(controller));

router.post('/2fa/enable', authMiddleware, controller.enable2FA.bind(controller));
router.post('/2fa/verify', authMiddleware, controller.verify2FA.bind(controller));

export { router as authRoutes };