/**
 * Audit Exporter Service
 *
 * Provides log export functionality for compliance evidence.
 * Supports JSON (NDJSON) and CSV formats.
 *
 * Features:
 * - Sync export for small datasets (<= 10,000 rows)
 * - Date range validation (max 90 days)
 * - Streaming export for efficiency
 * - Export event logging for audit trail
 */

import { Readable } from 'stream';
import { getPrismaClient } from '../config/database';
import logger from '../config/logger';

/**
 * Export parameters
 */
export interface ExportParams {
  format: 'json' | 'csv';
  startDate: Date;
  endDate: Date;
  userId: string; // For audit logging
}

/**
 * Sync export result (direct streaming)
 */
export interface SyncExportResult {
  type: 'sync';
  stream: Readable;
  contentType: string;
  filename: string;
  rowCount: number;
}

/**
 * Async export result (for large datasets - future enhancement)
 */
export interface AsyncExportResult {
  type: 'async';
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  estimatedRows: number;
  downloadUrl?: string;
}

export type ExportResult = SyncExportResult | AsyncExportResult;

/**
 * Validation error for export parameters
 */
export class ExportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportValidationError';
  }
}

/**
 * Audit Exporter Service
 */
export class AuditExporterService {
  private static readonly SYNC_THRESHOLD = 10000;
  private static readonly MAX_DAYS = 90;

  /**
   * Export audit logs with the specified parameters
   */
  async exportLogs(params: ExportParams): Promise<ExportResult> {
    // Validate date range
    this.validateDateRange(params.startDate, params.endDate);

    // Estimate row count
    const estimatedRows = await this.estimateRowCount(params.startDate, params.endDate);

    // Log export attempt
    await this.logExportEvent(params, estimatedRows);

    // For now, we only support sync exports
    // Async exports with S3 storage can be added later
    if (estimatedRows > AuditExporterService.SYNC_THRESHOLD) {
      logger.warn('Large export requested, proceeding with sync export', {
        event: 'AUDIT_EXPORT_LARGE',
        estimatedRows,
        userId: params.userId,
      });
    }

    return this.generateSyncExport(params, estimatedRows);
  }

  /**
   * Validate date range parameters
   */
  private validateDateRange(startDate: Date, endDate: Date): void {
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff < 0) {
      throw new ExportValidationError('startDate must be before endDate');
    }

    if (daysDiff > AuditExporterService.MAX_DAYS) {
      throw new ExportValidationError(
        `Date range exceeds maximum of ${AuditExporterService.MAX_DAYS} days`
      );
    }

    // Validate dates are not in the future
    const now = new Date();
    if (startDate > now || endDate > now) {
      throw new ExportValidationError('Dates cannot be in the future');
    }
  }

  /**
   * Estimate row count for the date range
   */
  private async estimateRowCount(startDate: Date, endDate: Date): Promise<number> {
    const prisma = getPrismaClient();

    return prisma.auditLog.count({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
  }

  /**
   * Generate sync export
   */
  private async generateSyncExport(
    params: ExportParams,
    rowCount: number
  ): Promise<SyncExportResult> {
    const prisma = getPrismaClient();

    const logs = await prisma.auditLog.findMany({
      where: {
        timestamp: {
          gte: params.startDate,
          lte: params.endDate,
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    if (params.format === 'json') {
      return this.generateJsonExport(logs, params, rowCount);
    } else {
      return this.generateCsvExport(logs, params, rowCount);
    }
  }

  /**
   * Generate NDJSON export
   */
  private generateJsonExport(
    logs: Array<{
      id: string;
      sequenceNum: number;
      previousHash: string | null;
      contentHash: string;
      timestamp: Date;
      userId: string | null;
      sessionId: string | null;
      requestId: string | null;
      endpoint: string | null;
      requestHash: string | null;
      responseHash: string | null;
      securityDecision: string | null;
      tier: number | null;
      anomalyScore: number | null;
      patternsMatched: string[];
      processingMs: number | null;
    }>,
    params: ExportParams,
    rowCount: number
  ): SyncExportResult {
    const lines = logs.map((log) => {
      return JSON.stringify({
        id: log.id,
        sequenceNum: log.sequenceNum,
        timestamp: log.timestamp.toISOString(),
        userId: log.userId,
        sessionId: log.sessionId,
        requestId: log.requestId,
        endpoint: log.endpoint,
        securityDecision: log.securityDecision,
        tier: log.tier,
        anomalyScore: log.anomalyScore,
        patternsMatched: log.patternsMatched,
        processingMs: log.processingMs,
        contentHash: log.contentHash,
        previousHash: log.previousHash,
        requestHash: log.requestHash,
        responseHash: log.responseHash,
      });
    });

    const stream = Readable.from(lines.map((line) => line + '\n'));

    const startStr = params.startDate.toISOString().split('T')[0];
    const endStr = params.endDate.toISOString().split('T')[0];

    return {
      type: 'sync',
      stream,
      contentType: 'application/x-ndjson',
      filename: `audit-export-${startStr}-to-${endStr}.ndjson`,
      rowCount,
    };
  }

  /**
   * Generate CSV export
   */
  private generateCsvExport(
    logs: Array<{
      id: string;
      sequenceNum: number;
      previousHash: string | null;
      contentHash: string;
      timestamp: Date;
      userId: string | null;
      sessionId: string | null;
      requestId: string | null;
      endpoint: string | null;
      requestHash: string | null;
      responseHash: string | null;
      securityDecision: string | null;
      tier: number | null;
      anomalyScore: number | null;
      patternsMatched: string[];
      processingMs: number | null;
    }>,
    params: ExportParams,
    rowCount: number
  ): SyncExportResult {
    const columns = [
      'id',
      'sequenceNum',
      'timestamp',
      'userId',
      'sessionId',
      'requestId',
      'endpoint',
      'securityDecision',
      'tier',
      'anomalyScore',
      'patternsMatched',
      'processingMs',
      'contentHash',
    ];

    // Create header row
    const header = columns.join(',') + '\n';

    // Create data rows
    const rows = logs.map((log) => {
      const values = [
        this.escapeCsvValue(log.id),
        log.sequenceNum.toString(),
        this.escapeCsvValue(log.timestamp.toISOString()),
        this.escapeCsvValue(log.userId || ''),
        this.escapeCsvValue(log.sessionId || ''),
        this.escapeCsvValue(log.requestId || ''),
        this.escapeCsvValue(log.endpoint || ''),
        this.escapeCsvValue(log.securityDecision || ''),
        log.tier !== null ? log.tier.toString() : '',
        log.anomalyScore !== null ? log.anomalyScore.toString() : '',
        this.escapeCsvValue(JSON.stringify(log.patternsMatched)),
        log.processingMs !== null ? log.processingMs.toString() : '',
        this.escapeCsvValue(log.contentHash),
      ];
      return values.join(',');
    });

    const csvContent = header + rows.join('\n');
    const stream = Readable.from([csvContent]);

    const startStr = params.startDate.toISOString().split('T')[0];
    const endStr = params.endDate.toISOString().split('T')[0];

    return {
      type: 'sync',
      stream,
      contentType: 'text/csv',
      filename: `audit-export-${startStr}-to-${endStr}.csv`,
      rowCount,
    };
  }

  /**
   * Escape CSV value (handle quotes and commas)
   */
  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  /**
   * Log export event for audit trail
   */
  private async logExportEvent(params: ExportParams, estimatedRows: number): Promise<void> {
    const prisma = getPrismaClient();

    try {
      await prisma.securityEvent.create({
        data: {
          eventType: 'AUDIT_LOG_EXPORT',
          severity: 'LOW',
          userId: params.userId,
          details: {
            format: params.format,
            startDate: params.startDate.toISOString(),
            endDate: params.endDate.toISOString(),
            estimatedRows,
            exportType: 'sync',
            timestamp: new Date().toISOString(),
          },
          status: 'PENDING',
          alertSent: false,
        },
      });

      logger.info('Audit log export initiated', {
        event: 'AUDIT_LOG_EXPORT_STARTED',
        userId: params.userId,
        format: params.format,
        startDate: params.startDate.toISOString(),
        endDate: params.endDate.toISOString(),
        estimatedRows,
      });
    } catch (error) {
      logger.error('Failed to log export event', {
        event: 'AUDIT_EXPORT_LOG_ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - export should still proceed
    }
  }

  /**
   * Get export configuration
   */
  getConfig(): { syncThreshold: number; maxDays: number } {
    return {
      syncThreshold: AuditExporterService.SYNC_THRESHOLD,
      maxDays: AuditExporterService.MAX_DAYS,
    };
  }
}

// Export singleton instance
export const auditExporter = new AuditExporterService();
