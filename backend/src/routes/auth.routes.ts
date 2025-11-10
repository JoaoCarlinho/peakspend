import { Router } from 'express';
import {
  registerHandler,
  loginHandler,
  getMeHandler,
  logoutHandler,
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
 * POST /api/auth/logout
 * Logout current user (client-side token invalidation)
 * Protected route - requires valid JWT
 */
router.post('/logout', requireAuth, logoutHandler);

/**
 * GET /api/auth/me
 * Get current authenticated user
 * Protected route - requires valid JWT
 */
router.get('/me', requireAuth, getMeHandler);

export default router;
