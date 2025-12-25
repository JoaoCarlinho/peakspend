/**
 * Security Flags API Routes
 *
 * Provides API endpoints for runtime security flag management.
 * All endpoints require admin role.
 *
 * Endpoints:
 * - GET /api/admin/security-flags - Get all flags with metadata
 * - PUT /api/admin/security-flags - Update one or more flags
 * - POST /api/admin/security-flags/reset - Reset flag(s) to defaults
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getPrismaClient } from '../config/database';
import logger from '../config/logger';
import { requireAuth } from '../middleware/auth.middleware';
import { runtimeFlagsService } from '../security/runtimeFlags.service';
import { securityConfigService } from '../security/securityConfig.service';
import { FeatureFlag } from '../config/security.config';

const router = Router();

// Valid feature flag names
const VALID_FLAGS: FeatureFlag[] = [
  'INPUT_INSPECTION_ENABLED',
  'OUTPUT_INSPECTION_ENABLED',
  'AUDIT_LOGGING_ENABLED',
  'PROMPT_PROTECTION_ENABLED',
  'TENANT_ISOLATION_ENABLED',
  'ANOMALY_DETECTION_ENABLED',
  'TOOL_RBAC_ENABLED',
  'TIER2_INSPECTION_ENABLED',
];

/**
 * Middleware to check for admin role
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
      logger.warn('Unauthorized access to security flags endpoint', {
        event: 'SECURITY_FLAGS_API_UNAUTHORIZED',
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
    logger.error('Error checking admin role for security flags', {
      event: 'SECURITY_FLAGS_API_ROLE_CHECK_ERROR',
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
 * GET /api/admin/security-flags
 * Get all security flags with metadata
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const flags = runtimeFlagsService.getFlagsWithMetadata();
    const mode = securityConfigService.getSecurityMode();
    const status = securityConfigService.getSecurityStatus();

    res.json({
      data: {
        mode,
        flags,
        overrideCount: runtimeFlagsService.getOverrideCount(),
        modeInitializedAt: status.initializedAt,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to get security flags', {
      event: 'SECURITY_FLAGS_API_GET_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve security flags',
      },
    });
  }
});

/**
 * PUT /api/admin/security-flags
 * Update one or more security flags
 *
 * Body: { flags: { FLAG_NAME: boolean, ... } }
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    const { flags } = req.body;

    if (!flags || typeof flags !== 'object') {
      res.status(400).json({
        error: {
          code: 'INVALID_PARAMS',
          message: 'flags object required in request body',
        },
      });
      return;
    }

    const changes: Array<{ flag: string; value: boolean }> = [];

    for (const [flag, value] of Object.entries(flags)) {
      // Validate flag name
      if (!VALID_FLAGS.includes(flag as FeatureFlag)) {
        res.status(400).json({
          error: {
            code: 'INVALID_FLAG',
            message: `Unknown flag: ${flag}`,
          },
        });
        return;
      }

      // Validate value type
      if (typeof value !== 'boolean') {
        res.status(400).json({
          error: {
            code: 'INVALID_VALUE',
            message: `Flag value must be boolean: ${flag}`,
          },
        });
        return;
      }

      await runtimeFlagsService.setFlag(flag as FeatureFlag, value, req.userId!);
      changes.push({ flag, value });
    }

    const updatedFlags = runtimeFlagsService.getFlagsWithMetadata();

    logger.info('Security flags updated via API', {
      event: 'SECURITY_FLAGS_API_UPDATE',
      userId: req.userId,
      changes,
    });

    res.json({
      message: 'Flags updated successfully',
      data: {
        changes,
        flags: updatedFlags,
      },
    });
  } catch (error) {
    logger.error('Failed to update security flags', {
      event: 'SECURITY_FLAGS_API_UPDATE_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update security flags',
      },
    });
  }
});

/**
 * POST /api/admin/security-flags/reset
 * Reset one or all flags to mode defaults
 *
 * Body: { flag?: string } - if flag is provided, reset only that flag; otherwise reset all
 */
router.post('/reset', async (req: Request, res: Response) => {
  try {
    const { flag } = req.body;

    if (flag) {
      // Validate flag name
      if (!VALID_FLAGS.includes(flag as FeatureFlag)) {
        res.status(400).json({
          error: {
            code: 'INVALID_FLAG',
            message: `Unknown flag: ${flag}`,
          },
        });
        return;
      }

      await runtimeFlagsService.resetFlag(flag as FeatureFlag, req.userId!);

      logger.info('Security flag reset via API', {
        event: 'SECURITY_FLAGS_API_RESET',
        userId: req.userId,
        flag,
      });
    } else {
      await runtimeFlagsService.resetAllFlags(req.userId!);

      logger.info('All security flags reset via API', {
        event: 'SECURITY_FLAGS_API_RESET_ALL',
        userId: req.userId,
      });
    }

    const updatedFlags = runtimeFlagsService.getFlagsWithMetadata();

    res.json({
      message: flag ? `Flag ${flag} reset to default` : 'All flags reset to defaults',
      data: {
        flags: updatedFlags,
      },
    });
  } catch (error) {
    logger.error('Failed to reset security flags', {
      event: 'SECURITY_FLAGS_API_RESET_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to reset security flags',
      },
    });
  }
});

export default router;
