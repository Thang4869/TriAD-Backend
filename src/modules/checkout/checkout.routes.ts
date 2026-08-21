import { Router } from 'express';

const router = Router();

router.post('/', (req, res) => {
  res.json({ message: 'Checkout route working' });
});

export { router as checkoutRoutes };