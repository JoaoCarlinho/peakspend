/**
 * Security Events API Routes
 *
 * Provides API endpoints for viewing and streaming security events.
 * All endpoints require authentication (security role for sensitive data).
 *
 * Endpoints:
 * - GET /api/security/events - List security events with pagination/filtering
 * - GET /api/security/events/stream - SSE stream for real-time events
 * - GET /api/security/events/types - List all event types
 * - GET /api/security/events/stats - Get event statistics
 */

import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getPrismaClient } from '../config/database';
import logger from '../config/logger';
import { requireAuth } from '../middleware/auth.middleware';
import { eventBroadcaster } from '../security/eventBroadcaster';

const router = Router();

/**
 * Middleware to check for security or admin role
 */
async function requireSecurityRole(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    if (user.role !== 'admin' && user.role !== 'security') {
      logger.warn('Unauthorized access to security events endpoint', {
        event: 'SECURITY_EVENTS_API_UNAUTHORIZED',
        userId: req.userId,
        userRole: user.role,
        path: req.path,
      });
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Security or admin role required',
        },
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Error checking security role', {
      event: 'SECURITY_EVENTS_API_ROLE_CHECK_ERROR',
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
router.use(requireSecurityRole);

/**
 * GET /api/security/events
 * List security events with pagination and filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const prisma = getPrismaClient();

    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;
    const eventType = req.query.type as string | undefined;
    const severity = req.query.severity as string | undefined;
    const userId = req.query.userId as string | undefined;

    // Build where clause
    const where: {
      eventType?: string;
      severity?: string;
      userId?: string;
    } = {};

    if (eventType) where.eventType = eventType;
    if (severity) where.severity = severity;
    if (userId) where.userId = userId;

    const [events, total] = await Promise.all([
      prisma.securityEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.securityEvent.count({ where }),
    ]);

    res.json({
      data: {
        events,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + events.length < total,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to fetch security events', {
      event: 'SECURITY_EVENTS_API_LIST_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve security events',
      },
    });
  }
});

/**
 * GET /api/security/events/stream
 * Server-Sent Events endpoint for real-time event streaming
 */
router.get('/stream', (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  const clientId = uuidv4();

  // Parse filters from query
  const filters: {
    eventTypes?: string[];
    severities?: string[];
  } = {};

  if (req.query.types) {
    filters.eventTypes = (req.query.types as string).split(',');
  }
  if (req.query.severities) {
    filters.severities = (req.query.severities as string).split(',');
  }

  // Register client with broadcaster
  eventBroadcaster.addClient(clientId, res, filters);

  // Keep connection alive with periodic heartbeat
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      // Client disconnected
      clearInterval(heartbeatInterval);
      eventBroadcaster.removeClient(clientId);
    }
  }, 30000);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    eventBroadcaster.removeClient(clientId);
  });

  logger.debug('SSE stream connected', {
    event: 'SSE_STREAM_CONNECTED',
    clientId,
    filters,
  });
});

/**
 * GET /api/security/events/types
 * List all event types with counts
 */
router.get('/types', async (_req: Request, res: Response) => {
  try {
    const prisma = getPrismaClient();

    const types = await prisma.securityEvent.groupBy({
      by: ['eventType'],
      _count: { eventType: true },
    });

    res.json({
      data: {
        types: types.map((t) => ({
          type: t.eventType,
          count: t._count.eventType,
        })),
      },
    });
  } catch (error) {
    logger.error('Failed to fetch event types', {
      event: 'SECURITY_EVENTS_API_TYPES_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve event types',
      },
    });
  }
});

/**
 * GET /api/security/events/stats
 * Get event statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const prisma = getPrismaClient();

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalCount,
      lastHourCount,
      lastDayCount,
      bySeverity,
      byType,
    ] = await Promise.all([
      prisma.securityEvent.count(),
      prisma.securityEvent.count({
        where: { timestamp: { gte: oneHourAgo } },
      }),
      prisma.securityEvent.count({
        where: { timestamp: { gte: oneDayAgo } },
      }),
      prisma.securityEvent.groupBy({
        by: ['severity'],
        _count: { severity: true },
        where: { timestamp: { gte: oneDayAgo } },
      }),
      prisma.securityEvent.groupBy({
        by: ['eventType'],
        _count: { eventType: true },
        where: { timestamp: { gte: oneDayAgo } },
        orderBy: { _count: { eventType: 'desc' } },
        take: 10,
      }),
    ]);

    res.json({
      data: {
        total: totalCount,
        lastHour: lastHourCount,
        lastDay: lastDayCount,
        connectedClients: eventBroadcaster.getClientCount(),
        bySeverity: bySeverity.map((s) => ({
          severity: s.severity,
          count: s._count.severity,
        })),
        topEventTypes: byType.map((t) => ({
          type: t.eventType,
          count: t._count.eventType,
        })),
      },
    });
  } catch (error) {
    logger.error('Failed to fetch event stats', {
      event: 'SECURITY_EVENTS_API_STATS_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve event statistics',
      },
    });
  }
});

export default router;
