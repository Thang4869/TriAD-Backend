import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({ message: 'Notifications route working' });
});

export { router as notificationRoutes };