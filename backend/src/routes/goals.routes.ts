import { Router } from 'express';
import { goalsController } from '../controllers/goals.controller';
import { requireAuth } from '../middleware/auth.middleware';

/**
 * Goals Routes - Secure Implementation
 *
 * All routes require authentication.
 * Tenant isolation is enforced at the service level.
 */

const router = Router();

// All goals routes require authentication
router.use(requireAuth);

// CRUD operations
router.post('/', goalsController.createGoal);
router.get('/', goalsController.getGoals);
router.get('/:id', goalsController.getGoalById);
router.patch('/:id', goalsController.updateGoal);
router.delete('/:id', goalsController.deleteGoal);

// Progress update
router.post('/:id/progress', goalsController.updateProgress);

export default router;
