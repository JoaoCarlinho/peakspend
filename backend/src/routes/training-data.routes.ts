import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { TrainingDataController } from '../controllers/training-data.controller';
import {
  recordFeedbackSchema,
  getTrainingDataQuerySchema,
} from '../validation/training-data.validation';

const router = Router();
const trainingDataController = new TrainingDataController();

// Record user feedback (positive or negative)
router.post(
  '/',
  requireAuth,
  validateRequest(recordFeedbackSchema),
  trainingDataController.recordFeedback.bind(trainingDataController)
);

// Get user's training data
router.get(
  '/',
  requireAuth,
  validateRequest(getTrainingDataQuerySchema),
  trainingDataController.getTrainingData.bind(trainingDataController)
);

// Get training data statistics
router.get(
  '/stats',
  requireAuth,
  trainingDataController.getStats.bind(trainingDataController)
);

export default router;
