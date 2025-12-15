/**
 * Admin API Routes
 *
 * Provides API endpoints for administrative operations.
 * All endpoints require admin role.
 *
 * Endpoints:
 * - GET /api/admin/alert-config - Get current alert configuration (sanitized)
 * - POST /api/admin/alert-config/reload - Reload alert configuration from file
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getPrismaClient } from '../config/database';
import logger from '../config/logger';
import { requireAuth } from '../middleware/auth.middleware';
import { alertConfigService } from '../security/alertConfig';

const router = Router();

/**
 * Middleware to check for admin role
 * Reads user role from database based on authenticated userId
 */
async function requireAdminRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  const prisma = getPrismaClient();

  try {
    if (!req.userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    // Get user role from database
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { role: true },
    });

    if (!user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not found',
        },
      });
      return;
    }

    if (user.role !== 'admin') {
      logger.warn('Unauthorized access to admin endpoint', {
        event: 'ADMIN_API_UNAUTHORIZED',
        userId: req.userId,
        userRole: user.role,
        path: req.path,
      });
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Admin role required',
        },
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Error checking admin role', {
      event: 'ADMIN_API_ROLE_CHECK_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to verify permissions',
      },
    });
  }
}

// Apply authentication and role check to all routes
router.use(requireAuth);
router.use(requireAdminRole);

/**
 * GET /api/admin/alert-config
 * Get current alert configuration (sanitized - sensitive values redacted)
 *
 * Response:
 * - config: Current configuration with sensitive values redacted
 * - lastReloadAt: ISO timestamp of last configuration load
 */
router.get('/alert-config', (_req: Request, res: Response) => {
  try {
    const sanitizedConfig = alertConfigService.getSanitizedConfig();

    logger.debug('Alert config retrieved via API', {
      event: 'ALERT_CONFIG_API_GET',
    });

    res.json({
      data: {
        config: sanitizedConfig,
        lastReloadAt: sanitizedConfig.lastReloadAt,
      },
    });
  } catch (error) {
    logger.error('Failed to get alert config', {
      event: 'ALERT_CONFIG_API_GET_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve alert configuration',
      },
    });
  }
});

/**
 * POST /api/admin/alert-config/reload
 * Manually trigger configuration reload from file
 *
 * Response:
 * - success: boolean indicating if reload was successful
 * - lastReloadAt: ISO timestamp of reload
 */
router.post('/alert-config/reload', (req: Request, res: Response) => {
  try {
    const success = alertConfigService.reload();

    if (success) {
      logger.info('Alert config reloaded via API', {
        event: 'ALERT_CONFIG_API_RELOAD',
        userId: req.userId,
      });

      res.json({
        message: 'Alert configuration reloaded successfully',
        data: {
          success: true,
          lastReloadAt: alertConfigService.getLastReloadAt().toISOString(),
        },
      });
    } else {
      res.status(500).json({
        error: {
          code: 'RELOAD_FAILED',
          message: 'Failed to reload configuration - check logs for details',
        },
      });
    }
  } catch (error) {
    logger.error('Failed to reload alert config via API', {
      event: 'ALERT_CONFIG_API_RELOAD_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to reload alert configuration',
      },
    });
  }
});

export default router;
