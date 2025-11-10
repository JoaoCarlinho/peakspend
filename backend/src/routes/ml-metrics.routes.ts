import { Router } from 'express';
import { MlMetricsController } from '../controllers/ml-metrics.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
const mlMetricsController = new MlMetricsController();

/**
 * GET /api/ml-metrics/accuracy
 * Get accuracy metrics
 */
router.get('/accuracy', requireAuth, mlMetricsController.getAccuracy);

/**
 * GET /api/ml-metrics/dashboard
 * Get performance dashboard data
 */
router.get('/dashboard', requireAuth, mlMetricsController.getDashboard);

/**
 * GET /api/ml-metrics/improvement
 * Get improvement metrics showing ML learning progress
 */
router.get('/improvement', requireAuth, mlMetricsController.getImprovement);

export default router;
