import { Router } from 'express';
import { chatController } from '../controllers/chat.controller';
import { requireAuth } from '../middleware/auth.middleware';

/**
 * Chat Routes - Secure Implementation
 *
 * All routes require authentication.
 * Input inspection middleware is applied at the app.ts level for /api/chat routes.
 */

const router = Router();

// All chat routes require authentication
router.use(requireAuth);

// Session management
router.post('/sessions', chatController.createSession);
router.get('/sessions', chatController.getSessions);

// Message handling within sessions
router.get('/sessions/:sessionId/messages', chatController.getMessages);
router.post('/sessions/:sessionId/messages', chatController.sendMessage);

// Quick message endpoint (auto-creates session)
router.post('/message', chatController.quickMessage);

export default router;
