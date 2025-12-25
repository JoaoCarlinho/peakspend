/**
 * Integrity Check Worker
 *
 * Scheduled background job that runs daily to verify audit log integrity.
 * Generates alerts on any detected tampering.
 *
 * Features:
 * - Configurable schedule via INTEGRITY_CHECK_SCHEDULE env var
 * - Checks last 24 hours of entries by default
 * - Creates security events for success/failure
 * - CRITICAL severity alerts on integrity failures
 */

import cron, { ScheduledTask } from 'node-cron';
import { getPrismaClient } from '../config/database';
import logger from '../config/logger';
import { logIntegrity, VerificationResult } from './logIntegrity.service';

let scheduledTask: ScheduledTask | null = null;
let isRunning = false;

/**
 * Run the integrity check
 */
async function runIntegrityCheck(): Promise<VerificationResult> {
  if (isRunning) {
    logger.warn('Integrity check already running, skipping', {
      event: 'INTEGRITY_CHECK_SKIP_RUNNING',
    });
    throw new Error('Integrity check already running');
  }

  isRunning = true;
  const prisma = getPrismaClient();

  try {
    logger.info('Starting scheduled integrity check', {
      event: 'INTEGRITY_CHECK_START',
    });

    // Verify entries from the last 24 hours
    const result = await logIntegrity.verifyRecentIntegrity(24);

    if (result.valid) {
      // Log success
      await prisma.securityEvent.create({
        data: {
          eventType: 'LOG_INTEGRITY_CHECK_PASSED',
          severity: 'LOW',
          userId: null, // System event
          details: {
            checkedCount: result.checkedCount,
            startSequence: result.startSequence,
            endSequence: result.endSequence,
            durationMs: result.durationMs,
            verifiedAt: result.verifiedAt.toISOString(),
            timestamp: new Date().toISOString(),
          },
          status: 'COMPLETED',
          alertSent: false,
        },
      });

      logger.info('Scheduled integrity check passed', {
        event: 'INTEGRITY_CHECK_PASSED',
        checkedCount: result.checkedCount,
        durationMs: result.durationMs,
      });
    } else {
      // Log failure - CRITICAL severity
      await prisma.securityEvent.create({
        data: {
          eventType: 'LOG_INTEGRITY_FAILURE',
          severity: 'CRITICAL',
          userId: null, // System event
          details: {
            failedAt: result.failedAt,
            failureReason: result.failureReason,
            expectedHash: result.expectedHash,
            actualHash: result.actualHash,
            checkedCount: result.checkedCount,
            startSequence: result.startSequence,
            endSequence: result.endSequence,
            verifiedAt: result.verifiedAt.toISOString(),
            timestamp: new Date().toISOString(),
          },
          status: 'PENDING', // Needs review
          alertSent: false,
        },
      });

      logger.error('INTEGRITY CHECK FAILED - POSSIBLE TAMPERING', {
        event: 'INTEGRITY_CHECK_FAILED',
        failedAt: result.failedAt,
        reason: result.failureReason,
        expectedHash: result.expectedHash,
        actualHash: result.actualHash,
      });
    }

    return result;
  } catch (error) {
    logger.error('Integrity check failed with error', {
      event: 'INTEGRITY_CHECK_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });

    // Log error event
    await prisma.securityEvent.create({
      data: {
        eventType: 'LOG_INTEGRITY_CHECK_ERROR',
        severity: 'HIGH',
        userId: null,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
        status: 'PENDING',
        alertSent: false,
      },
    });

    throw error;
  } finally {
    isRunning = false;
  }
}

/**
 * Start the integrity check worker with scheduled job
 */
export function startIntegrityCheckWorker(): void {
  const schedule = process.env['INTEGRITY_CHECK_SCHEDULE'] || '0 3 * * *'; // 3 AM daily

  // Validate cron expression
  if (!cron.validate(schedule)) {
    logger.error('Invalid integrity check schedule', {
      event: 'INTEGRITY_WORKER_INVALID_SCHEDULE',
      schedule,
    });
    throw new Error(`Invalid cron expression: ${schedule}`);
  }

  scheduledTask = cron.schedule(schedule, async () => {
    try {
      await runIntegrityCheck();
    } catch {
      // Error already logged in runIntegrityCheck
    }
  });

  logger.info('Integrity check worker started', {
    event: 'INTEGRITY_WORKER_STARTED',
    schedule,
  });
}

/**
 * Stop the integrity check worker
 */
export function stopIntegrityCheckWorker(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Integrity check worker stopped', {
      event: 'INTEGRITY_WORKER_STOPPED',
    });
  }
}

/**
 * Check if the integrity check is currently running
 */
export function isIntegrityCheckRunning(): boolean {
  return isRunning;
}

/**
 * Manually trigger an integrity check
 */
export async function triggerIntegrityCheck(
  startSequence?: number,
  endSequence?: number
): Promise<VerificationResult> {
  if (isRunning) {
    throw new Error('Integrity check already running');
  }

  isRunning = true;
  const prisma = getPrismaClient();

  try {
    logger.info('Starting manual integrity check', {
      event: 'INTEGRITY_CHECK_MANUAL_START',
      startSequence,
      endSequence,
    });

    let result: VerificationResult;

    if (startSequence !== undefined || endSequence !== undefined) {
      result = await logIntegrity.verifyIntegrity(startSequence, endSequence);
    } else {
      result = await logIntegrity.verifyRecentIntegrity(24);
    }

    // Log the manual check
    await prisma.securityEvent.create({
      data: {
        eventType: 'LOG_INTEGRITY_CHECK_MANUAL',
        severity: result.valid ? 'LOW' : 'CRITICAL',
        userId: null,
        details: {
          valid: result.valid,
          checkedCount: result.checkedCount,
          startSequence: result.startSequence,
          endSequence: result.endSequence,
          failedAt: result.failedAt,
          failureReason: result.failureReason,
          durationMs: result.durationMs,
          timestamp: new Date().toISOString(),
        },
        status: 'COMPLETED',
        alertSent: false,
      },
    });

    return result;
  } finally {
    isRunning = false;
  }
}
