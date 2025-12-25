/**
 * Review Queue Routes
 *
 * API endpoints for managing the human review queue for escalated inputs.
 * All endpoints require security role authentication.
 *
 * Endpoints:
 * - GET /api/security/review-queue - List pending reviews
 * - GET /api/security/review-queue/:id - Get specific review
 * - PUT /api/security/review-queue/:id - Update review status
 * - GET /api/security/review-queue/stats - Get queue statistics
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import logger from '../config/logger';
import { escalationService } from '../llm/guardrails/escalation.service';

const router = Router();

/**
 * Middleware to check for security role
 * In production, this would verify JWT claims for role
 */
function requireSecurityRole(req: Request, res: Response, next: NextFunction): void {
  // Check for security role in user context
  // This is a simplified check - in production, verify from JWT/session
  const userRole = req.headers['x-user-role'] || (req as Request & { userRole?: string }).userRole;

  if (userRole !== 'security' && userRole !== 'admin') {
    logger.warn('Unauthorized access to review queue', {
      event: 'REVIEW_QUEUE_UNAUTHORIZED',
      userId: req.userId,
      path: req.path,
    });
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Security role required',
      },
    });
    return;
  }

  next();
}

// Apply security role check to all routes
router.use(requireSecurityRole);

/**
 * GET /api/security/review-queue
 * List pending reviews
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query['limit'] as string) || 50;
    const reviews = await escalationService.getPendingReviews(Math.min(limit, 100));

    logger.debug('Retrieved pending reviews', {
      event: 'REVIEW_QUEUE_LIST',
      count: reviews.length,
      userId: req.userId,
    });

    res.json({
      data: reviews.map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        userId: r.userId,
        sessionId: r.sessionId,
        severity: r.severity,
        anomalyScore: (r.details as Record<string, unknown>)['anomalyScore'],
        factorBreakdown: (r.details as Record<string, unknown>)['factorBreakdown'],
        endpoint: (r.details as Record<string, unknown>)['endpoint'],
        inputLength: (r.details as Record<string, unknown>)['inputLength'],
      })),
      count: reviews.length,
    });
  } catch (error) {
    logger.error('Failed to retrieve review queue', {
      event: 'REVIEW_QUEUE_ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve review queue',
      },
    });
  }
});

/**
 * GET /api/security/review-queue/stats
 * Get queue statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await escalationService.getQueueStats();

    res.json({
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to retrieve queue stats', {
      event: 'REVIEW_QUEUE_STATS_ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve queue statistics',
      },
    });
  }
});

/**
 * GET /api/security/review-queue/:id
 * Get specific review details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const reviewId = req.params['id'];

    if (!reviewId) {
      res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Review ID required',
        },
      });
      return;
    }

    const review = await escalationService.getReview(reviewId);

    if (!review) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Review not found',
        },
      });
      return;
    }

    logger.debug('Retrieved review details', {
      event: 'REVIEW_QUEUE_GET',
      reviewId,
      userId: req.userId,
    });

    res.json({
      data: review,
    });
  } catch (error) {
    logger.error('Failed to retrieve review', {
      event: 'REVIEW_GET_ERROR',
      reviewId: req.params['id'],
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve review',
      },
    });
  }
});

// Zod schema for review resolution
const ReviewResolutionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'DISMISS']),
  reason: z.string().optional(),
});

/**
 * PUT /api/security/review-queue/:id
 * Resolve a review
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const reviewId = req.params['id'];

    if (!reviewId) {
      res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Review ID required',
        },
      });
      return;
    }

    // Validate request body
    const validation = ReviewResolutionSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid request body',
          details: validation.error.issues,
        },
      });
      return;
    }

    const { action, reason } = validation.data;
    const reviewerId = req.userId || 'unknown';

    // Resolve the review
    const result = await escalationService.resolveReview(reviewId, action, reviewerId, reason);

    if (!result.success) {
      res.status(400).json({
        error: {
          code: 'RESOLUTION_FAILED',
          message: result.message,
        },
      });
      return;
    }

    logger.info('Review resolved', {
      event: 'REVIEW_RESOLVED',
      reviewId,
      action,
      reviewerId,
    });

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    logger.error('Failed to resolve review', {
      event: 'REVIEW_RESOLVE_ERROR',
      reviewId: req.params['id'],
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to resolve review',
      },
    });
  }
});

export default router;
