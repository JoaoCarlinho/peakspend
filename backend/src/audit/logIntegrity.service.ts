/**
 * Log Integrity Service
 *
 * Provides verification of audit log integrity using hash chain validation.
 * Each log entry contains a hash of its content plus the hash of the previous
 * entry, creating an unbroken chain that reveals any modifications.
 *
 * Features:
 * - SHA-256 content hash computation
 * - Chain linkage verification
 * - Range-based verification for efficiency
 * - Detailed failure reporting
 */

import * as crypto from 'crypto';
import { getPrismaClient } from '../config/database';
import logger from '../config/logger';

/**
 * Result of an integrity verification
 */
export interface VerificationResult {
  valid: boolean;
  checkedCount: number;
  startSequence: number;
  endSequence: number;
  failedAt?: number;
  failureReason?: string;
  expectedHash?: string;
  actualHash?: string;
  verifiedAt: Date;
  durationMs: number;
}

/**
 * Data structure for computing content hash
 * Must match the fields used in auditLogger.service.ts
 */
interface HashableLogData {
  userId: string | null;
  requestId: string | null;
  securityDecision: string | null;
  timestamp: string; // ISO format
  requestHash: string | null;
  responseHash: string | null;
}

/**
 * Log Integrity Service
 */
export class LogIntegrityService {
  /**
   * Compute SHA-256 hash of log content
   * Must match the computation in auditLogger.service.ts
   */
  computeContentHash(data: HashableLogData): string {
    const content = JSON.stringify({
      userId: data.userId,
      requestId: data.requestId,
      securityDecision: data.securityDecision,
      timestamp: data.timestamp,
      requestHash: data.requestHash,
      responseHash: data.responseHash,
    });
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get the last entry in the chain
   */
  async getLastEntry(): Promise<{ sequenceNum: number; contentHash: string } | null> {
    const prisma = getPrismaClient();

    const lastEntry = await prisma.auditLog.findFirst({
      orderBy: { sequenceNum: 'desc' },
      select: { sequenceNum: true, contentHash: true },
    });

    return lastEntry;
  }

  /**
   * Verify integrity of log entries in a range
   *
   * @param startSequence - Starting sequence number (inclusive)
   * @param endSequence - Ending sequence number (inclusive)
   * @returns Verification result with details
   */
  async verifyIntegrity(
    startSequence?: number,
    endSequence?: number
  ): Promise<VerificationResult> {
    const prisma = getPrismaClient();
    const startTime = Date.now();

    // Build where clause for range
    const where: { sequenceNum?: { gte?: number; lte?: number } } = {};

    if (startSequence !== undefined || endSequence !== undefined) {
      where.sequenceNum = {};
      if (startSequence !== undefined) {
        where.sequenceNum.gte = startSequence;
      }
      if (endSequence !== undefined) {
        where.sequenceNum.lte = endSequence;
      }
    }

    // Fetch entries in order
    const entries = await prisma.auditLog.findMany({
      where,
      orderBy: { sequenceNum: 'asc' },
      select: {
        id: true,
        sequenceNum: true,
        contentHash: true,
        previousHash: true,
        timestamp: true,
        userId: true,
        requestId: true,
        securityDecision: true,
        requestHash: true,
        responseHash: true,
      },
    });

    if (entries.length === 0) {
      return {
        valid: true,
        checkedCount: 0,
        startSequence: startSequence ?? 0,
        endSequence: endSequence ?? 0,
        verifiedAt: new Date(),
        durationMs: Date.now() - startTime,
      };
    }

    // If not starting from genesis, get the hash of the entry before startSequence
    let expectedPreviousHash: string | null = null;

    if (startSequence !== undefined && startSequence > 1) {
      const priorEntry = await prisma.auditLog.findFirst({
        where: { sequenceNum: startSequence - 1 },
        select: { contentHash: true },
      });
      expectedPreviousHash = priorEntry?.contentHash ?? null;
    }

    // Verify each entry
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      if (!entry) continue;

      // Verify content hash
      const expectedContentHash = this.computeContentHash({
        userId: entry.userId,
        requestId: entry.requestId,
        securityDecision: entry.securityDecision,
        timestamp: entry.timestamp.toISOString(),
        requestHash: entry.requestHash,
        responseHash: entry.responseHash,
      });

      if (entry.contentHash !== expectedContentHash) {
        logger.warn('Integrity check failed: content hash mismatch', {
          event: 'INTEGRITY_CONTENT_HASH_MISMATCH',
          sequenceNum: entry.sequenceNum,
          expectedHash: expectedContentHash,
          actualHash: entry.contentHash,
        });

        return {
          valid: false,
          checkedCount: i + 1,
          startSequence: entries[0]!.sequenceNum,
          endSequence: entries[entries.length - 1]!.sequenceNum,
          failedAt: entry.sequenceNum,
          failureReason: 'Content hash mismatch - possible tampering',
          expectedHash: expectedContentHash,
          actualHash: entry.contentHash,
          verifiedAt: new Date(),
          durationMs: Date.now() - startTime,
        };
      }

      // Verify chain linkage
      // For genesis entry (sequenceNum 1), previousHash should be null
      // For other entries, previousHash should match prior entry's contentHash
      if (i === 0 && entry.sequenceNum === 1) {
        // Genesis entry - previousHash should be null
        if (entry.previousHash !== null) {
          logger.warn('Integrity check failed: genesis entry has non-null previousHash', {
            event: 'INTEGRITY_GENESIS_HASH_ERROR',
            sequenceNum: entry.sequenceNum,
            previousHash: entry.previousHash,
          });

          return {
            valid: false,
            checkedCount: i + 1,
            startSequence: entries[0]!.sequenceNum,
            endSequence: entries[entries.length - 1]!.sequenceNum,
            failedAt: entry.sequenceNum,
            failureReason: 'Genesis entry has non-null previousHash',
            expectedHash: 'null',
            actualHash: entry.previousHash,
            verifiedAt: new Date(),
            durationMs: Date.now() - startTime,
          };
        }
      } else if (expectedPreviousHash !== null && entry.previousHash !== expectedPreviousHash) {
        logger.warn('Integrity check failed: chain linkage broken', {
          event: 'INTEGRITY_CHAIN_BROKEN',
          sequenceNum: entry.sequenceNum,
          expectedPreviousHash,
          actualPreviousHash: entry.previousHash,
        });

        return {
          valid: false,
          checkedCount: i + 1,
          startSequence: entries[0]!.sequenceNum,
          endSequence: entries[entries.length - 1]!.sequenceNum,
          failedAt: entry.sequenceNum,
          failureReason: 'Chain linkage broken - previous hash mismatch',
          expectedHash: expectedPreviousHash,
          actualHash: entry.previousHash ?? 'null',
          verifiedAt: new Date(),
          durationMs: Date.now() - startTime,
        };
      }

      // Update expected previous hash for next iteration
      expectedPreviousHash = entry.contentHash;
    }

    // All entries verified successfully
    logger.info('Integrity check passed', {
      event: 'INTEGRITY_CHECK_PASSED',
      checkedCount: entries.length,
      startSequence: entries[0]!.sequenceNum,
      endSequence: entries[entries.length - 1]!.sequenceNum,
      durationMs: Date.now() - startTime,
    });

    return {
      valid: true,
      checkedCount: entries.length,
      startSequence: entries[0]!.sequenceNum,
      endSequence: entries[entries.length - 1]!.sequenceNum,
      verifiedAt: new Date(),
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Verify integrity of entries from the last N hours
   */
  async verifyRecentIntegrity(hours: number = 24): Promise<VerificationResult> {
    const prisma = getPrismaClient();
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Find the oldest entry within the time range
    const oldestEntry = await prisma.auditLog.findFirst({
      where: { timestamp: { gte: cutoff } },
      orderBy: { sequenceNum: 'asc' },
      select: { sequenceNum: true },
    });

    // Find the most recent entry
    const latestEntry = await prisma.auditLog.findFirst({
      orderBy: { sequenceNum: 'desc' },
      select: { sequenceNum: true },
    });

    if (!oldestEntry || !latestEntry) {
      return {
        valid: true,
        checkedCount: 0,
        startSequence: 0,
        endSequence: 0,
        verifiedAt: new Date(),
        durationMs: 0,
      };
    }

    return this.verifyIntegrity(oldestEntry.sequenceNum, latestEntry.sequenceNum);
  }

  /**
   * Get chain statistics
   */
  async getChainStats(): Promise<{
    totalEntries: number;
    firstSequence: number | null;
    lastSequence: number | null;
    hasGaps: boolean;
  }> {
    const prisma = getPrismaClient();

    const [total, first, last] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.findFirst({
        orderBy: { sequenceNum: 'asc' },
        select: { sequenceNum: true },
      }),
      prisma.auditLog.findFirst({
        orderBy: { sequenceNum: 'desc' },
        select: { sequenceNum: true },
      }),
    ]);

    // Check for gaps: if total != (last - first + 1), there are gaps
    const hasGaps =
      first !== null &&
      last !== null &&
      total !== last.sequenceNum - first.sequenceNum + 1;

    return {
      totalEntries: total,
      firstSequence: first?.sequenceNum ?? null,
      lastSequence: last?.sequenceNum ?? null,
      hasGaps,
    };
  }
}

// Export singleton instance
export const logIntegrity = new LogIntegrityService();
