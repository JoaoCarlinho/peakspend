import { Router } from 'express';
import {
  registerHandler,
  loginHandler,
  getMeHandler,
} from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user
 * Public route
 */
router.post('/register', registerHandler);

/**
 * POST /api/auth/login
 * Login with email and password
 * Public route
 */
router.post('/login', loginHandler);

/**
 * GET /api/auth/me
 * Get current authenticated user
 * Protected route - requires valid JWT
 */
router.get('/me', requireAuth, getMeHandler);

export default router;
