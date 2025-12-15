/**
 * Retention Policy Service
 *
 * Manages audit log retention and purging for compliance.
 * Features:
 * - Configurable retention period (30-365 days, default: 90)
 * - Legal hold support to preserve logs during investigations
 * - Batch deletion to avoid long locks
 * - Full audit trail of purge operations
 */

import { getPrismaClient } from '../config/database';
import logger from '../config/logger';

/**
 * Result of a purge operation
 */
export interface PurgeResult {
  purgedCount: number;
  skippedCount: number; // Legal hold
  errorCount: number;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
}

/**
 * Retention configuration
 */
export interface RetentionConfig {
  retentionDays: number;
  batchSize: number;
  purgeSchedule: string; // Cron expression
}

/**
 * Legal hold info
 */
export interface LegalHoldInfo {
  logId: string;
  legalHold: boolean;
  legalHoldReason: string | null;
  legalHoldSetAt: Date | null;
  legalHoldSetBy: string | null;
}

/**
 * Retention Policy Service
 */
export class RetentionPolicyService {
  private static readonly DEFAULT_RETENTION_DAYS = 90;
  private static readonly MIN_RETENTION_DAYS = 30;
  private static readonly MAX_RETENTION_DAYS = 365;
  private static readonly BATCH_SIZE = 1000;

  private config: RetentionConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Load and validate configuration from environment
   */
  private loadConfig(): RetentionConfig {
    const retentionDaysEnv = process.env['AUDIT_LOG_RETENTION_DAYS'];
    const retentionDays = retentionDaysEnv
      ? parseInt(retentionDaysEnv, 10)
      : RetentionPolicyService.DEFAULT_RETENTION_DAYS;

    if (
      retentionDays < RetentionPolicyService.MIN_RETENTION_DAYS ||
      retentionDays > RetentionPolicyService.MAX_RETENTION_DAYS
    ) {
      logger.error('Invalid AUDIT_LOG_RETENTION_DAYS configuration', {
        event: 'RETENTION_CONFIG_INVALID',
        value: retentionDays,
        min: RetentionPolicyService.MIN_RETENTION_DAYS,
        max: RetentionPolicyService.MAX_RETENTION_DAYS,
      });
      throw new Error(
        `AUDIT_LOG_RETENTION_DAYS must be between ` +
          `${RetentionPolicyService.MIN_RETENTION_DAYS} and ` +
          `${RetentionPolicyService.MAX_RETENTION_DAYS}`
      );
    }

    return {
      retentionDays,
      batchSize: RetentionPolicyService.BATCH_SIZE,
      purgeSchedule: process.env['RETENTION_PURGE_SCHEDULE'] || '0 2 * * *', // 2 AM daily
    };
  }

  /**
   * Calculate the cutoff date for expired logs
   */
  getCutoffDate(): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.retentionDays);
    return cutoff;
  }

  /**
   * Get counts of expired and held logs
   */
  async getExpiredLogsCount(): Promise<{ expired: number; held: number }> {
    const prisma = getPrismaClient();
    const cutoffDate = this.getCutoffDate();

    const [expired, held] = await Promise.all([
      prisma.auditLog.count({
        where: {
          timestamp: { lt: cutoffDate },
          legalHold: false,
        },
      }),
      prisma.auditLog.count({
        where: {
          timestamp: { lt: cutoffDate },
          legalHold: true,
        },
      }),
    ]);

    return { expired, held };
  }

  /**
   * Purge expired logs (respecting legal holds)
   */
  async purgeExpiredLogs(dryRun = false): Promise<PurgeResult> {
    const prisma = getPrismaClient();
    const startedAt = new Date();
    const cutoffDate = this.getCutoffDate();

    // Get counts first
    const { expired, held } = await this.getExpiredLogsCount();

    // Log start event
    await this.logPurgeEvent('RETENTION_PURGE_STARTED', {
      cutoffDate: cutoffDate.toISOString(),
      expectedPurgeCount: expired,
      legalHoldCount: held,
      dryRun,
    });

    if (dryRun) {
      logger.info('Retention purge dry run completed', {
        event: 'RETENTION_PURGE_DRY_RUN',
        expectedPurgeCount: expired,
        legalHoldCount: held,
      });

      return {
        purgedCount: 0,
        skippedCount: held,
        errorCount: 0,
        startedAt,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
      };
    }

    let purgedCount = 0;
    let errorCount = 0;

    try {
      // Delete in batches to avoid long-running transactions
      while (true) {
        const batch = await prisma.auditLog.findMany({
          where: {
            timestamp: { lt: cutoffDate },
            legalHold: false,
          },
          take: this.config.batchSize,
          select: { id: true },
        });

        if (batch.length === 0) break;

        const ids = batch.map((log) => log.id);

        await prisma.auditLog.deleteMany({
          where: { id: { in: ids } },
        });

        purgedCount += batch.length;

        logger.debug('Retention purge batch completed', {
          event: 'RETENTION_PURGE_BATCH',
          batchSize: batch.length,
          totalPurged: purgedCount,
        });

        // Yield to event loop between batches
        await new Promise((resolve) => setImmediate(resolve));
      }
    } catch (error) {
      errorCount++;
      logger.error('Retention purge failed', {
        event: 'RETENTION_PURGE_ERROR',
        error: error instanceof Error ? error.message : String(error),
        purgedCount,
      });

      await this.logPurgeEvent('RETENTION_PURGE_FAILED', {
        cutoffDate: cutoffDate.toISOString(),
        purgedCount,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }

    const completedAt = new Date();

    // Log completion event
    await this.logPurgeEvent('RETENTION_PURGE_COMPLETED', {
      cutoffDate: cutoffDate.toISOString(),
      purgedCount,
      skippedCount: held,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    });

    logger.info('Retention purge completed', {
      event: 'RETENTION_PURGE_COMPLETED',
      purgedCount,
      skippedCount: held,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    });

    return {
      purgedCount,
      skippedCount: held,
      errorCount,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
  }

  /**
   * Log a purge event to the security events table
   */
  private async logPurgeEvent(
    eventType: string,
    details: Record<string, unknown>
  ): Promise<void> {
    const prisma = getPrismaClient();

    try {
      await prisma.securityEvent.create({
        data: {
          eventType,
          severity: eventType.includes('FAILED') ? 'HIGH' : 'LOW',
          userId: null, // System event
          details: {
            ...details,
            timestamp: new Date().toISOString(),
          },
          status: 'COMPLETED',
          alertSent: false,
        },
      });
    } catch (error) {
      logger.error('Failed to log purge event', {
        event: 'RETENTION_LOG_ERROR',
        eventType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Set or remove legal hold on a log entry
   */
  async setLegalHold(
    logId: string,
    enabled: boolean,
    reason: string | null,
    setBy: string
  ): Promise<LegalHoldInfo> {
    const prisma = getPrismaClient();

    const updatedLog = await prisma.auditLog.update({
      where: { id: logId },
      data: {
        legalHold: enabled,
        legalHoldReason: enabled ? reason : null,
        legalHoldSetAt: enabled ? new Date() : null,
        legalHoldSetBy: enabled ? setBy : null,
      },
      select: {
        id: true,
        legalHold: true,
        legalHoldReason: true,
        legalHoldSetAt: true,
        legalHoldSetBy: true,
      },
    });

    // Log legal hold change
    await prisma.securityEvent.create({
      data: {
        eventType: enabled ? 'LEGAL_HOLD_APPLIED' : 'LEGAL_HOLD_REMOVED',
        severity: 'MEDIUM',
        userId: setBy,
        details: {
          logId,
          enabled,
          reason,
          timestamp: new Date().toISOString(),
        },
        status: 'COMPLETED',
        alertSent: false,
      },
    });

    logger.info('Legal hold updated', {
      event: enabled ? 'LEGAL_HOLD_APPLIED' : 'LEGAL_HOLD_REMOVED',
      logId,
      setBy,
      reason,
    });

    return {
      logId: updatedLog.id,
      legalHold: updatedLog.legalHold,
      legalHoldReason: updatedLog.legalHoldReason,
      legalHoldSetAt: updatedLog.legalHoldSetAt,
      legalHoldSetBy: updatedLog.legalHoldSetBy,
    };
  }

  /**
   * Get legal hold status for a log entry
   */
  async getLegalHold(logId: string): Promise<LegalHoldInfo | null> {
    const prisma = getPrismaClient();

    const log = await prisma.auditLog.findUnique({
      where: { id: logId },
      select: {
        id: true,
        legalHold: true,
        legalHoldReason: true,
        legalHoldSetAt: true,
        legalHoldSetBy: true,
      },
    });

    if (!log) return null;

    return {
      logId: log.id,
      legalHold: log.legalHold,
      legalHoldReason: log.legalHoldReason,
      legalHoldSetAt: log.legalHoldSetAt,
      legalHoldSetBy: log.legalHoldSetBy,
    };
  }

  /**
   * Get logs with legal hold
   */
  async getLogsWithLegalHold(
    limit = 100,
    offset = 0
  ): Promise<{ logs: LegalHoldInfo[]; total: number }> {
    const prisma = getPrismaClient();

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { legalHold: true },
        take: limit,
        skip: offset,
        orderBy: { legalHoldSetAt: 'desc' },
        select: {
          id: true,
          legalHold: true,
          legalHoldReason: true,
          legalHoldSetAt: true,
          legalHoldSetBy: true,
        },
      }),
      prisma.auditLog.count({
        where: { legalHold: true },
      }),
    ]);

    return {
      logs: logs.map((log) => ({
        logId: log.id,
        legalHold: log.legalHold,
        legalHoldReason: log.legalHoldReason,
        legalHoldSetAt: log.legalHoldSetAt,
        legalHoldSetBy: log.legalHoldSetBy,
      })),
      total,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): RetentionConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const retentionPolicy = new RetentionPolicyService();
