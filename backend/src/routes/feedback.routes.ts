import { Router } from 'express';
import { FeedbackController } from '../controllers/feedback.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
const feedbackController = new FeedbackController();

/**
 * POST /api/feedback/record
 * Record user feedback on ML prediction
 */
router.post('/record', requireAuth, feedbackController.recordFeedback);

/**
 * GET /api/feedback/stats
 * Get feedback statistics
 */
router.get('/stats', requireAuth, feedbackController.getStats);

/**
 * GET /api/feedback/process
 * Process feedback and get insights
 */
router.get('/process', requireAuth, feedbackController.processFeedback);

/**
 * GET /api/feedback/training-data
 * Get training data for incremental learning
 */
router.get('/training-data', requireAuth, feedbackController.getTrainingData);

/**
 * GET /api/feedback/retraining-check
 * Check if model retraining should be triggered
 */
router.get('/retraining-check', requireAuth, feedbackController.checkRetraining);

export default router;
