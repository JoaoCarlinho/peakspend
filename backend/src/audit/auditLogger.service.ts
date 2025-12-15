/**
 * Audit Logger Service
 *
 * Provides async audit logging for LLM interactions and security events.
 * Uses an in-memory queue with background processing to avoid blocking
 * request handlers.
 *
 * Features:
 * - Async logging via internal queue
 * - Exponential backoff for retries
 * - Critical events written synchronously
 * - Feature flag integration
 * - Hash chain integrity (delegated to logIntegrity service)
 */

import * as crypto from 'crypto';
import { getPrismaClient } from '../config/database';
import logger from '../config/logger';
import { securityConfigService } from '../security/securityConfig.service';
import {
  AuditLogData,
  SecurityEventData,
  AuditQueueJob,
  AuditJobOptions,
  QueueAddResult,
} from './types';

/**
 * Simple in-memory queue for audit jobs
 * Can be replaced with Bull/Redis for production scaling
 */
class AuditQueue {
  private queue: Array<{ job: AuditQueueJob; attempts: number; nextAttempt: number }> = [];
  private processing = false;
  private maxAttempts = 5;
  private baseDelayMs = 1000; // 1 second base delay for exponential backoff
  private maxQueueSize = 10000;
  private processIntervalMs = 100;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.startProcessing();
  }

  /**
   * Add a job to the queue
   */
  add(job: AuditQueueJob, _options?: AuditJobOptions): QueueAddResult {
    if (this.queue.length >= this.maxQueueSize) {
      logger.warn('Audit queue full, dropping oldest job', {
        event: 'AUDIT_QUEUE_FULL',
        queueSize: this.queue.length,
      });
      this.queue.shift(); // Remove oldest job
    }

    const jobId = crypto.randomUUID();
    this.queue.push({
      job,
      attempts: 0,
      nextAttempt: Date.now(),
    });

    return { jobId, success: true };
  }

  /**
   * Start background processing
   */
  private startProcessing(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      void this.processNext();
    }, this.processIntervalMs);
  }

  /**
   * Stop background processing (for graceful shutdown)
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Process the next job in the queue
   */
  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    // Find a job ready for processing
    const now = Date.now();
    const readyIndex = this.queue.findIndex((item) => item.nextAttempt <= now);
    if (readyIndex === -1) return;

    this.processing = true;
    const item = this.queue[readyIndex];

    if (!item) {
      this.processing = false;
      return;
    }

    try {
      await this.processJob(item.job);
      // Success - remove from queue
      this.queue.splice(readyIndex, 1);
    } catch (error) {
      item.attempts++;

      if (item.attempts >= this.maxAttempts) {
        // Max attempts reached - move to dead letter (just log and discard)
        logger.error('Audit job failed after max attempts', {
          event: 'AUDIT_JOB_DEAD_LETTER',
          jobType: item.job.type,
          attempts: item.attempts,
          error: error instanceof Error ? error.message : String(error),
        });
        this.queue.splice(readyIndex, 1);
      } else {
        // Schedule retry with exponential backoff
        const delay = this.baseDelayMs * Math.pow(2, item.attempts - 1);
        item.nextAttempt = Date.now() + delay;

        logger.warn('Audit job failed, scheduling retry', {
          event: 'AUDIT_JOB_RETRY',
          jobType: item.job.type,
          attempt: item.attempts,
          nextAttemptIn: delay,
        });
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: AuditQueueJob): Promise<void> {
    if (job.type === 'llm-interaction') {
      await writeAuditEntry(job.data as AuditLogData);
    } else if (job.type === 'security-event') {
      await writeSecurityEventEntry(job.data as SecurityEventData);
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): { pending: number; processing: boolean } {
    return {
      pending: this.queue.length,
      processing: this.processing,
    };
  }

  /**
   * Flush all pending jobs (for graceful shutdown)
   */
  async flush(): Promise<void> {
    while (this.queue.length > 0) {
      await this.processNext();
      // Small delay to prevent tight loop
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

/**
 * Write audit entry to database
 */
async function writeAuditEntry(data: AuditLogData): Promise<void> {
  const prisma = getPrismaClient();

  // Compute content hash for integrity
  const contentHash = computeContentHash(data);

  // Get previous entry for chain linking
  const previousEntry = await prisma.auditLog.findFirst({
    orderBy: { sequenceNum: 'desc' },
    select: { contentHash: true },
  });

  const previousHash = previousEntry?.contentHash ?? null;

  // Build data object with explicit null handling for exactOptionalPropertyTypes
  const createData: {
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
  } = {
    previousHash,
    contentHash,
    timestamp: data.timestamp,
    userId: data.userId !== 'anonymous' ? data.userId : null,
    sessionId: data.sessionId,
    requestId: data.requestId,
    endpoint: data.endpoint,
    requestHash: data.requestHash,
    responseHash: data.responseHash,
    securityDecision: data.securityDecision,
    tier: data.tier !== undefined ? data.tier : null,
    anomalyScore: data.anomalyScore !== undefined ? data.anomalyScore : null,
    patternsMatched: data.patternsMatched || [],
    processingMs: data.processingMs,
  };

  await prisma.auditLog.create({
    data: createData,
  });
}

/**
 * Write security event entry to database
 */
async function writeSecurityEventEntry(data: SecurityEventData): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.securityEvent.create({
    data: {
      eventType: data.eventType,
      severity: data.severity,
      userId: data.userId && data.userId !== 'SYSTEM' ? data.userId : null,
      sessionId: data.sessionId || null,
      requestId: data.requestId || null,
      details: data.details
        ? {
            ...data.details,
            timestamp: new Date().toISOString(),
          }
        : { timestamp: new Date().toISOString() },
      status: 'PENDING',
      alertSent: false,
    },
  });
}

/**
 * Compute SHA-256 content hash for audit entry
 */
function computeContentHash(data: AuditLogData): string {
  const content = JSON.stringify({
    userId: data.userId,
    requestId: data.requestId,
    securityDecision: data.securityDecision,
    timestamp: data.timestamp.toISOString(),
    requestHash: data.requestHash,
    responseHash: data.responseHash,
  });
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Audit Logger Service - Singleton
 */
export class AuditLoggerService {
  private static instance: AuditLoggerService;
  private queue: AuditQueue;

  private constructor() {
    this.queue = new AuditQueue();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): AuditLoggerService {
    if (!AuditLoggerService.instance) {
      AuditLoggerService.instance = new AuditLoggerService();
    }
    return AuditLoggerService.instance;
  }

  /**
   * Log an LLM interaction
   * Critical events (BLOCK, tier 3) are written synchronously
   * Normal events are queued for async processing
   */
  async logLLMInteraction(data: AuditLogData): Promise<void> {
    // Check feature flag
    if (!securityConfigService.isFeatureEnabled('AUDIT_LOGGING_ENABLED')) {
      logger.debug('Audit logging disabled, skipping', {
        event: 'AUDIT_LOG_SKIPPED',
        reason: 'feature_disabled',
      });
      return;
    }

    // Critical events: sync write for guaranteed persistence
    if (data.securityDecision === 'BLOCK' || data.tier === 3) {
      try {
        await writeAuditEntry(data);
        logger.debug('Critical audit entry written synchronously', {
          event: 'AUDIT_LOG_SYNC_WRITE',
          securityDecision: data.securityDecision,
          tier: data.tier,
        });
      } catch (error) {
        logger.error('Failed to write critical audit entry', {
          event: 'AUDIT_LOG_SYNC_ERROR',
          error: error instanceof Error ? error.message : String(error),
        });
        throw error; // Re-throw for critical events
      }
      return;
    }

    // Normal events: async via queue
    const result = this.queue.add(
      {
        type: 'llm-interaction',
        data,
        priority: 'normal',
        timestamp: new Date(),
      },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      }
    );

    logger.debug('Audit entry queued', {
      event: 'AUDIT_LOG_QUEUED',
      jobId: result.jobId,
      securityDecision: data.securityDecision,
    });
  }

  /**
   * Log a security event
   * CRITICAL events are written even if feature flag is disabled
   */
  async logSecurityEvent(data: SecurityEventData): Promise<void> {
    // Check feature flag (bypass for CRITICAL events)
    if (!securityConfigService.isFeatureEnabled('AUDIT_LOGGING_ENABLED')) {
      if (data.severity !== 'CRITICAL') {
        logger.debug('Audit logging disabled, skipping security event', {
          event: 'SECURITY_EVENT_SKIPPED',
          eventType: data.eventType,
        });
        return;
      }
      logger.warn('Writing CRITICAL security event despite disabled audit logging', {
        event: 'SECURITY_EVENT_FORCED_WRITE',
        eventType: data.eventType,
      });
    }

    // CRITICAL and HIGH events: sync write
    if (data.severity === 'CRITICAL' || data.severity === 'HIGH') {
      try {
        await writeSecurityEventEntry(data);
        logger.debug('Security event written synchronously', {
          event: 'SECURITY_EVENT_SYNC_WRITE',
          eventType: data.eventType,
          severity: data.severity,
        });
      } catch (error) {
        logger.error('Failed to write security event', {
          event: 'SECURITY_EVENT_SYNC_ERROR',
          error: error instanceof Error ? error.message : String(error),
        });
        if (data.severity === 'CRITICAL') {
          throw error; // Re-throw for CRITICAL events
        }
      }
      return;
    }

    // MEDIUM and LOW events: async via queue with higher priority
    const priority = data.severity === 'MEDIUM' ? 1 : 2;
    this.queue.add(
      {
        type: 'security-event',
        data,
        priority: priority === 1 ? 'critical' : 'normal',
        timestamp: new Date(),
      },
      { priority }
    );

    logger.debug('Security event queued', {
      event: 'SECURITY_EVENT_QUEUED',
      eventType: data.eventType,
      severity: data.severity,
    });
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): { pending: number; processing: boolean } {
    return this.queue.getStats();
  }

  /**
   * Gracefully close the service
   * Flushes pending jobs and stops processing
   */
  async close(): Promise<void> {
    logger.info('Closing audit logger service', { event: 'AUDIT_LOGGER_CLOSING' });
    this.queue.stop();
    await this.queue.flush();
    logger.info('Audit logger service closed', { event: 'AUDIT_LOGGER_CLOSED' });
  }
}

// Export singleton instance
export const auditLogger = AuditLoggerService.getInstance();
