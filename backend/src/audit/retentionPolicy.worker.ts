/**
 * Retention Policy Worker
 *
 * Scheduled background job that runs daily to purge expired audit logs.
 * Uses node-cron for scheduling with configurable cron expression.
 *
 * Features:
 * - Configurable schedule via RETENTION_PURGE_SCHEDULE env var
 * - Job overlap prevention (mutex)
 * - Graceful shutdown handling
 */

import cron, { ScheduledTask } from 'node-cron';
import logger from '../config/logger';
import { retentionPolicy } from './retentionPolicy.service';

let isRunning = false;
let scheduledTask: ScheduledTask | null = null;

/**
 * Execute the retention purge job
 */
async function runPurgeJob(): Promise<void> {
  if (isRunning) {
    logger.warn('Retention purge already running, skipping', {
      event: 'RETENTION_PURGE_SKIP_RUNNING',
    });
    return;
  }

  isRunning = true;
  logger.info('Starting scheduled retention purge', {
    event: 'RETENTION_PURGE_START',
  });

  try {
    const result = await retentionPolicy.purgeExpiredLogs();

    logger.info('Scheduled retention purge completed', {
      event: 'RETENTION_PURGE_COMPLETE',
      purgedCount: result.purgedCount,
      skippedCount: result.skippedCount,
      durationMs: result.durationMs,
    });
  } catch (error) {
    logger.error('Scheduled retention purge failed', {
      event: 'RETENTION_PURGE_FAILED',
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    isRunning = false;
  }
}

/**
 * Start the retention worker with scheduled purge job
 */
export function startRetentionWorker(): void {
  const config = retentionPolicy.getConfig();

  // Validate cron expression
  if (!cron.validate(config.purgeSchedule)) {
    logger.error('Invalid retention purge schedule', {
      event: 'RETENTION_WORKER_INVALID_SCHEDULE',
      schedule: config.purgeSchedule,
    });
    throw new Error(`Invalid cron expression: ${config.purgeSchedule}`);
  }

  scheduledTask = cron.schedule(config.purgeSchedule, runPurgeJob);

  logger.info('Retention worker started', {
    event: 'RETENTION_WORKER_STARTED',
    schedule: config.purgeSchedule,
    retentionDays: config.retentionDays,
  });
}

/**
 * Stop the retention worker
 */
export function stopRetentionWorker(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Retention worker stopped', {
      event: 'RETENTION_WORKER_STOPPED',
    });
  }
}

/**
 * Check if the retention worker is currently running a job
 */
export function isRetentionJobRunning(): boolean {
  return isRunning;
}

/**
 * Trigger a manual purge (for testing or admin use)
 * Returns the result of the purge operation
 */
export async function triggerManualPurge(dryRun = false): Promise<{
  purgedCount: number;
  skippedCount: number;
  durationMs: number;
}> {
  if (isRunning) {
    throw new Error('Retention purge already running');
  }

  isRunning = true;
  logger.info('Starting manual retention purge', {
    event: 'RETENTION_PURGE_MANUAL_START',
    dryRun,
  });

  try {
    const result = await retentionPolicy.purgeExpiredLogs(dryRun);
    return {
      purgedCount: result.purgedCount,
      skippedCount: result.skippedCount,
      durationMs: result.durationMs,
    };
  } finally {
    isRunning = false;
  }
}
