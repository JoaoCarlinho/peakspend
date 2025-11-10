import { Router } from 'express';
import { MlInferenceController } from '../controllers/ml-inference.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
const mlInferenceController = new MlInferenceController();

/**
 * POST /api/ml-inference/suggest-category
 * Get category suggestions for expense
 */
router.post('/suggest-category', requireAuth, mlInferenceController.suggestCategory);

/**
 * POST /api/ml-inference/detect-errors
 * Detect potential errors in expense data
 */
router.post('/detect-errors', requireAuth, mlInferenceController.detectErrors);

export default router;
