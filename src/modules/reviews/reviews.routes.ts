import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({ message: 'Reviews route working' });
});

export { router as reviewRoutes };