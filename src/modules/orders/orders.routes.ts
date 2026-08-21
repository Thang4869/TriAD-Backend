import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({ message: 'Orders route working' });
});

export { router as orderRoutes };