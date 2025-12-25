/**
 * Audit Log API Routes
 *
 * Provides API endpoints for querying and managing audit logs.
 * All endpoints require security or admin role.
 *
 * Endpoints:
 * - GET /api/audit/logs - List logs with pagination
 * - GET /api/audit/logs/search - Search logs by criteria
 * - GET /api/audit/logs/:id - Get single log entry
 * - GET /api/audit/export - Export logs as NDJSON or CSV
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getPrismaClient } from '../config/database';
import logger from '../config/logger';
import { requireAuth } from '../middleware/auth.middleware';
import {
  AuditLogSummary,
  AuditLogDetail,
  PaginationMeta,
} from './types';
import {
  auditExporter,
  ExportValidationError,
} from './auditExporter.service';
import { retentionPolicy } from './retentionPolicy.service';
import { triggerManualPurge, isRetentionJobRunning } from './retentionPolicy.worker';
import { logIntegrity } from './logIntegrity.service';
import { triggerIntegrityCheck, isIntegrityCheckRunning } from './integrityCheck.worker';

const router = Router();

/**
 * Middleware to check for security or admin role
 * Reads user role from database based on authenticated userId
 */
async function requireSecurityRole(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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

    if (user.role !== 'security' && user.role !== 'admin') {
      logger.warn('Unauthorized access to audit logs', {
        event: 'AUDIT_API_UNAUTHORIZED',
        userId: req.userId,
        userRole: user.role,
        path: req.path,
      });
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions to access audit logs',
        },
      });
      return;
    }

    // Store role for response filtering
    (req as Request & { userRole?: string }).userRole = user.role;
    next();
  } catch (error) {
    logger.error('Error checking security role', {
      event: 'AUDIT_API_ROLE_CHECK_ERROR',
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
 * Fields to select for list/search responses (excludes hashes for summary)
 */
const summarySelectFields = {
  id: true,
  sequenceNum: true,
  timestamp: true,
  userId: true,
  sessionId: true,
  endpoint: true,
  securityDecision: true,
  tier: true,
  anomalyScore: true,
  processingMs: true,
};

/**
 * All fields for detail response
 */
const detailSelectFields = {
  ...summarySelectFields,
  requestId: true,
  patternsMatched: true,
  requestHash: true,
  responseHash: true,
  contentHash: true,
  previousHash: true,
};

// Validation schemas
const ListQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortBy: z.enum(['timestamp', 'sequenceNum', 'securityDecision']).default('timestamp'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const SearchQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  endpoint: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  securityDecision: z.string().optional(), // Comma-separated list
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * Transform database record to summary DTO
 */
function toSummary(record: {
  id: string;
  sequenceNum: number;
  timestamp: Date;
  userId: string | null;
  sessionId: string | null;
  endpoint: string | null;
  securityDecision: string | null;
  tier: number | null;
  anomalyScore: number | null;
  processingMs: number | null;
}): AuditLogSummary {
  return {
    id: record.id,
    sequenceNum: record.sequenceNum,
    timestamp: record.timestamp.toISOString(),
    userId: record.userId,
    sessionId: record.sessionId,
    endpoint: record.endpoint,
    securityDecision: record.securityDecision,
    tier: record.tier,
    anomalyScore: record.anomalyScore,
    processingMs: record.processingMs,
  };
}

/**
 * Transform database record to detail DTO
 */
function toDetail(record: {
  id: string;
  sequenceNum: number;
  timestamp: Date;
  userId: string | null;
  sessionId: string | null;
  endpoint: string | null;
  securityDecision: string | null;
  tier: number | null;
  anomalyScore: number | null;
  processingMs: number | null;
  requestId: string | null;
  patternsMatched: string[];
  requestHash: string | null;
  responseHash: string | null;
  contentHash: string;
  previousHash: string | null;
}): AuditLogDetail {
  return {
    ...toSummary(record),
    requestId: record.requestId,
    patternsMatched: record.patternsMatched,
    requestHash: record.requestHash,
    responseHash: record.responseHash,
    contentHash: record.contentHash,
    previousHash: record.previousHash,
  };
}

/**
 * GET /api/audit/logs
 * List audit logs with pagination
 */
router.get('/logs', async (req: Request, res: Response) => {
  const prisma = getPrismaClient();

  try {
    const validation = ListQuerySchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_PARAMS',
          message: 'Invalid query parameters',
          details: validation.error.issues,
        },
      });
      return;
    }

    const { limit, offset, sortBy, sortOrder } = validation.data;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        take: limit,
        skip: offset,
        orderBy: { [sortBy]: sortOrder },
        select: summarySelectFields,
      }),
      prisma.auditLog.count(),
    ]);

    const pagination: PaginationMeta = {
      total,
      limit,
      offset,
      hasMore: offset + logs.length < total,
    };

    logger.debug('Audit logs listed', {
      event: 'AUDIT_LOGS_LIST',
      userId: req.userId,
      count: logs.length,
      total,
    });

    res.json({
      data: logs.map(toSummary),
      pagination,
    });
  } catch (error) {
    logger.error('Failed to list audit logs', {
      event: 'AUDIT_LOGS_LIST_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve audit logs',
      },
    });
  }
});

/**
 * GET /api/audit/logs/search
 * Search audit logs by criteria
 */
router.get('/logs/search', async (req: Request, res: Response) => {
  const prisma = getPrismaClient();

  try {
    const validation = SearchQuerySchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_PARAMS',
          message: 'Invalid query parameters',
          details: validation.error.issues,
        },
      });
      return;
    }

    const { userId, endpoint, startDate, endDate, securityDecision, limit, offset } =
      validation.data;

    // Build where clause
    const where: {
      userId?: string;
      endpoint?: { contains: string };
      timestamp?: { gte?: Date; lte?: Date };
      securityDecision?: { in: string[] };
    } = {};

    if (userId) {
      where.userId = userId;
    }

    if (endpoint) {
      where.endpoint = { contains: endpoint };
    }

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = startDate;
      }
      if (endDate) {
        where.timestamp.lte = endDate;
      }
    }

    if (securityDecision) {
      const decisions = securityDecision.split(',').map((d) => d.trim());
      where.securityDecision = { in: decisions };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { timestamp: 'desc' },
        select: summarySelectFields,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const pagination: PaginationMeta = {
      total,
      limit,
      offset,
      hasMore: offset + logs.length < total,
    };

    logger.debug('Audit logs searched', {
      event: 'AUDIT_LOGS_SEARCH',
      userId: req.userId,
      filters: { userId, endpoint, startDate, endDate, securityDecision },
      count: logs.length,
      total,
    });

    res.json({
      data: logs.map(toSummary),
      pagination,
      filters: {
        userId,
        endpoint,
        startDate,
        endDate,
        securityDecision: securityDecision ? securityDecision.split(',') : undefined,
      },
    });
  } catch (error) {
    logger.error('Failed to search audit logs', {
      event: 'AUDIT_LOGS_SEARCH_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to search audit logs',
      },
    });
  }
});

/**
 * GET /api/audit/logs/:id
 * Get single audit log entry by ID
 */
router.get('/logs/:id', async (req: Request, res: Response) => {
  const prisma = getPrismaClient();
  const logId = req.params['id'];

  if (!logId) {
    res.status(400).json({
      error: {
        code: 'INVALID_PARAMS',
        message: 'Log ID is required',
      },
    });
    return;
  }

  try {
    const log = await prisma.auditLog.findUnique({
      where: { id: logId },
      select: detailSelectFields,
    });

    if (!log) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Audit log entry not found',
        },
      });
      return;
    }

    logger.debug('Audit log retrieved', {
      event: 'AUDIT_LOG_GET',
      userId: req.userId,
      logId,
    });

    res.json({
      data: toDetail(log),
    });
  } catch (error) {
    logger.error('Failed to retrieve audit log', {
      event: 'AUDIT_LOG_GET_ERROR',
      logId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve audit log',
      },
    });
  }
});

// Export endpoint validation schema
const ExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

/**
 * GET /api/audit/export
 * Export audit logs as NDJSON or CSV for compliance evidence
 *
 * Query parameters:
 * - format: 'json' (NDJSON) or 'csv' (default: json)
 * - startDate: ISO date string (required)
 * - endDate: ISO date string (required)
 *
 * Response: Stream of audit logs in requested format
 */
router.get('/export', async (req: Request, res: Response) => {
  try {
    const validation = ExportQuerySchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_PARAMS',
          message: 'Invalid export parameters',
          details: validation.error.issues,
        },
      });
      return;
    }

    const { format, startDate, endDate } = validation.data;

    // Call export service
    const result = await auditExporter.exportLogs({
      format,
      startDate,
      endDate,
      userId: req.userId || 'unknown',
    });

    if (result.type === 'sync') {
      // Set response headers for file download
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('X-Row-Count', result.rowCount.toString());

      logger.info('Audit export initiated', {
        event: 'AUDIT_EXPORT_STARTED',
        userId: req.userId,
        format,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        rowCount: result.rowCount,
      });

      // Pipe the stream to response
      result.stream.pipe(res);

      result.stream.on('error', (err) => {
        logger.error('Audit export stream error', {
          event: 'AUDIT_EXPORT_STREAM_ERROR',
          error: err.message,
        });
        // Response may already be partially sent, can't change status
        res.end();
      });

      result.stream.on('end', () => {
        logger.info('Audit export completed', {
          event: 'AUDIT_EXPORT_COMPLETED',
          userId: req.userId,
          format,
          rowCount: result.rowCount,
        });
      });
    } else {
      // Async export result (for future implementation)
      res.status(202).json({
        data: {
          jobId: result.jobId,
          status: result.status,
          estimatedRows: result.estimatedRows,
        },
        message: 'Export job queued for processing',
      });
    }
  } catch (error) {
    if (error instanceof ExportValidationError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
        },
      });
      return;
    }

    logger.error('Failed to export audit logs', {
      event: 'AUDIT_EXPORT_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to export audit logs',
      },
    });
  }
});

/**
 * GET /api/audit/export/config
 * Get export configuration (limits, supported formats)
 */
router.get('/export/config', (_req: Request, res: Response) => {
  const config = auditExporter.getConfig();

  res.json({
    data: {
      supportedFormats: ['json', 'csv'],
      maxDays: config.maxDays,
      syncThreshold: config.syncThreshold,
      jsonContentType: 'application/x-ndjson',
      csvContentType: 'text/csv',
    },
  });
});

// =========================================================================
// Retention Policy Endpoints (Story 6.4)
// =========================================================================

// Zod schema for legal hold request
const LegalHoldSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().optional(),
});

/**
 * GET /api/audit/retention/config
 * Get retention policy configuration
 */
router.get('/retention/config', (_req: Request, res: Response) => {
  const config = retentionPolicy.getConfig();

  res.json({
    data: {
      retentionDays: config.retentionDays,
      purgeSchedule: config.purgeSchedule,
      batchSize: config.batchSize,
    },
  });
});

/**
 * GET /api/audit/retention/status
 * Get retention status (expired counts, held counts)
 */
router.get('/retention/status', async (_req: Request, res: Response) => {
  try {
    const counts = await retentionPolicy.getExpiredLogsCount();
    const cutoffDate = retentionPolicy.getCutoffDate();

    res.json({
      data: {
        cutoffDate: cutoffDate.toISOString(),
        expiredCount: counts.expired,
        legalHoldCount: counts.held,
        purgeJobRunning: isRetentionJobRunning(),
      },
    });
  } catch (error) {
    logger.error('Failed to get retention status', {
      event: 'RETENTION_STATUS_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get retention status',
      },
    });
  }
});

/**
 * GET /api/audit/logs/:id/legal-hold
 * Get legal hold status for a log entry
 */
router.get('/logs/:id/legal-hold', async (req: Request, res: Response) => {
  const logId = req.params['id'];

  if (!logId) {
    res.status(400).json({
      error: {
        code: 'INVALID_PARAMS',
        message: 'Log ID is required',
      },
    });
    return;
  }

  try {
    const holdInfo = await retentionPolicy.getLegalHold(logId);

    if (!holdInfo) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Audit log entry not found',
        },
      });
      return;
    }

    res.json({
      data: holdInfo,
    });
  } catch (error) {
    logger.error('Failed to get legal hold status', {
      event: 'LEGAL_HOLD_GET_ERROR',
      logId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get legal hold status',
      },
    });
  }
});

/**
 * PUT /api/audit/logs/:id/legal-hold
 * Set or remove legal hold on a log entry
 */
router.put('/logs/:id/legal-hold', async (req: Request, res: Response) => {
  const logId = req.params['id'];

  if (!logId) {
    res.status(400).json({
      error: {
        code: 'INVALID_PARAMS',
        message: 'Log ID is required',
      },
    });
    return;
  }

  const validation = LegalHoldSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      error: {
        code: 'INVALID_PARAMS',
        message: 'Invalid request body',
        details: validation.error.issues,
      },
    });
    return;
  }

  const { enabled, reason } = validation.data;

  // Require reason when enabling legal hold
  if (enabled && !reason) {
    res.status(400).json({
      error: {
        code: 'INVALID_PARAMS',
        message: 'Reason is required when enabling legal hold',
      },
    });
    return;
  }

  try {
    const holdInfo = await retentionPolicy.setLegalHold(
      logId,
      enabled,
      reason || null,
      req.userId || 'unknown'
    );

    logger.info('Legal hold updated', {
      event: 'LEGAL_HOLD_UPDATE',
      logId,
      enabled,
      userId: req.userId,
    });

    res.json({
      message: enabled ? 'Legal hold applied' : 'Legal hold removed',
      data: holdInfo,
    });
  } catch (error) {
    // Handle Prisma not found error
    const isNotFound =
      error instanceof Error &&
      error.message.includes('Record to update not found');

    if (isNotFound) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Audit log entry not found',
        },
      });
      return;
    }

    logger.error('Failed to update legal hold', {
      event: 'LEGAL_HOLD_UPDATE_ERROR',
      logId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update legal hold',
      },
    });
  }
});

/**
 * GET /api/audit/legal-holds
 * List all logs with legal hold
 */
router.get('/legal-holds', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query['limit'] as string) || 100;
    const offset = parseInt(req.query['offset'] as string) || 0;

    const result = await retentionPolicy.getLogsWithLegalHold(
      Math.min(limit, 200),
      offset
    );

    res.json({
      data: result.logs,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: offset + result.logs.length < result.total,
      },
    });
  } catch (error) {
    logger.error('Failed to list legal holds', {
      event: 'LEGAL_HOLD_LIST_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to list legal holds',
      },
    });
  }
});

/**
 * POST /api/audit/purge
 * Manually trigger a retention purge (admin only)
 *
 * Query params:
 * - dryRun: boolean - If true, only reports what would be purged
 *
 * Headers:
 * - X-Confirm-Purge: CONFIRM - Required for actual purge (not dry run)
 */
router.post('/purge', async (req: Request, res: Response) => {
  // Check for admin role
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({
    where: { id: req.userId || '' },
    select: { role: true },
  });

  if (user?.role !== 'admin') {
    logger.warn('Unauthorized purge attempt', {
      event: 'PURGE_UNAUTHORIZED',
      userId: req.userId,
    });
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin role required for manual purge',
      },
    });
    return;
  }

  const dryRun = req.query['dryRun'] === 'true';
  const confirmHeader = req.headers['x-confirm-purge'];

  // Require confirmation header for actual purge
  if (!dryRun && confirmHeader !== 'CONFIRM') {
    res.status(400).json({
      error: {
        code: 'CONFIRMATION_REQUIRED',
        message: 'Set X-Confirm-Purge: CONFIRM header to execute purge',
      },
    });
    return;
  }

  // Check if purge is already running
  if (isRetentionJobRunning()) {
    res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'Retention purge is already running',
      },
    });
    return;
  }

  try {
    const result = await triggerManualPurge(dryRun);

    logger.info('Manual purge completed', {
      event: 'MANUAL_PURGE_COMPLETE',
      dryRun,
      userId: req.userId,
      ...result,
    });

    res.json({
      message: dryRun ? 'Dry run completed' : 'Purge completed',
      data: result,
    });
  } catch (error) {
    logger.error('Manual purge failed', {
      event: 'MANUAL_PURGE_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to execute purge',
      },
    });
  }
});

// =========================================================================
// Log Integrity Endpoints (Story 6.5)
// =========================================================================

/**
 * GET /api/audit/integrity
 * Verify audit log integrity
 *
 * Query params:
 * - startSequence: number - Starting sequence number (optional)
 * - endSequence: number - Ending sequence number (optional)
 *
 * If no range specified, verifies last 24 hours
 */
router.get('/integrity', async (req: Request, res: Response) => {
  try {
    const startSequenceStr = req.query['startSequence'] as string | undefined;
    const endSequenceStr = req.query['endSequence'] as string | undefined;

    let startSequence: number | undefined;
    let endSequence: number | undefined;

    if (startSequenceStr) {
      startSequence = parseInt(startSequenceStr, 10);
      if (isNaN(startSequence)) {
        res.status(400).json({
          error: {
            code: 'INVALID_PARAMS',
            message: 'startSequence must be a number',
          },
        });
        return;
      }
    }

    if (endSequenceStr) {
      endSequence = parseInt(endSequenceStr, 10);
      if (isNaN(endSequence)) {
        res.status(400).json({
          error: {
            code: 'INVALID_PARAMS',
            message: 'endSequence must be a number',
          },
        });
        return;
      }
    }

    // Use the trigger function which logs the check
    const result = await triggerIntegrityCheck(startSequence, endSequence);

    logger.info('Integrity check completed via API', {
      event: 'INTEGRITY_CHECK_API',
      userId: req.userId,
      valid: result.valid,
      checkedCount: result.checkedCount,
    });

    res.json({
      message: result.valid
        ? 'Integrity verification passed'
        : 'INTEGRITY FAILURE DETECTED',
      data: result,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Integrity check already running') {
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'Integrity check is already running',
        },
      });
      return;
    }

    logger.error('Integrity check failed', {
      event: 'INTEGRITY_CHECK_API_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to verify integrity',
      },
    });
  }
});

/**
 * GET /api/audit/integrity/status
 * Get chain statistics and current status
 */
router.get('/integrity/status', async (_req: Request, res: Response) => {
  try {
    const stats = await logIntegrity.getChainStats();

    res.json({
      data: {
        ...stats,
        checkRunning: isIntegrityCheckRunning(),
      },
    });
  } catch (error) {
    logger.error('Failed to get integrity status', {
      event: 'INTEGRITY_STATUS_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get integrity status',
      },
    });
  }
});

export default router;
