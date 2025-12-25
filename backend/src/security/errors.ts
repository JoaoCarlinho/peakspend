/**
 * Security Error Classes
 *
 * Custom error classes for security-related failures. These errors are designed
 * to provide minimal information in responses while logging detailed information
 * internally for security analysis.
 */

import { getPrismaClient } from '../config/database';
import { getCurrentUserId, getUserContext } from './userContext.service';
import logger from '../config/logger';

/**
 * Base class for all security-related errors
 */
export class SecurityError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly metadata: Record<string, unknown> | undefined;

  constructor(
    message: string,
    code: string = 'SECURITY_ERROR',
    statusCode: number = 403,
    metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SecurityError';
    this.statusCode = statusCode;
    this.code = code;
    this.metadata = metadata ?? undefined;
  }
}

/**
 * Error thrown when cross-user access is detected
 *
 * This error is thrown when a user attempts to access another user's data.
 * The error message is intentionally generic to avoid information leakage.
 */
export class CrossUserAccessError extends SecurityError {
  constructor(metadata?: Record<string, unknown>) {
    super('Access denied', 'CROSS_USER_ACCESS', 403, metadata);
    this.name = 'CrossUserAccessError';
  }
}

/**
 * Error thrown for tenant isolation violations
 */
export class TenantIsolationViolationError extends SecurityError {
  constructor(metadata?: Record<string, unknown>) {
    super('Access denied', 'TENANT_ISOLATION_VIOLATION', 403, metadata);
    this.name = 'TenantIsolationViolationError';
  }
}

/**
 * Error thrown when a required user context is missing
 */
export class MissingUserContextError extends SecurityError {
  constructor(operation?: string) {
    const message = operation
      ? `Unauthorized: User context required for ${operation}`
      : 'Unauthorized: User context required';
    super(message, 'MISSING_USER_CONTEXT', 401);
    this.name = 'MissingUserContextError';
  }
}

/**
 * Error thrown when a security feature is misconfigured
 */
export class SecurityConfigError extends SecurityError {
  constructor(message: string) {
    super(message, 'SECURITY_CONFIG_ERROR', 500);
    this.name = 'SecurityConfigError';
  }
}

/**
 * Session tracker for detecting repeated cross-user access attempts
 */
class SessionCrossUserTracker {
  private attempts: Map<string, { count: number; firstAttempt: Date }> = new Map();
  private readonly MAX_ATTEMPTS = 3;
  private readonly WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Track a cross-user access attempt for a session
   * @returns The number of attempts in the current window
   */
  trackAttempt(sessionId: string): number {
    const now = new Date();
    const existing = this.attempts.get(sessionId);

    if (existing) {
      // Check if window has expired
      const elapsed = now.getTime() - existing.firstAttempt.getTime();
      if (elapsed > this.WINDOW_MS) {
        // Reset window
        this.attempts.set(sessionId, { count: 1, firstAttempt: now });
        return 1;
      }

      // Increment count
      existing.count++;
      return existing.count;
    }

    // First attempt
    this.attempts.set(sessionId, { count: 1, firstAttempt: now });
    return 1;
  }

  /**
   * Check if session has reached max attempts
   */
  hasExceededThreshold(sessionId: string): boolean {
    const existing = this.attempts.get(sessionId);
    return existing ? existing.count >= this.MAX_ATTEMPTS : false;
  }

  /**
   * Get attempt count for session
   */
  getAttemptCount(sessionId: string): number {
    return this.attempts.get(sessionId)?.count || 0;
  }

  /**
   * Clear old sessions to prevent memory leak
   */
  cleanup(): void {
    const now = Date.now();
    for (const [sessionId, data] of this.attempts.entries()) {
      if (now - data.firstAttempt.getTime() > this.WINDOW_MS) {
        this.attempts.delete(sessionId);
      }
    }
  }
}

// Singleton tracker instance
export const sessionCrossUserTracker = new SessionCrossUserTracker();

// Cleanup old sessions every 10 minutes
setInterval(() => sessionCrossUserTracker.cleanup(), 10 * 60 * 1000);

/**
 * Create a security event for cross-user access attempt
 */
export async function createCrossUserAccessEvent(
  targetUserId: string | null,
  context: {
    tool?: string;
    operation?: string;
    model?: string;
  }
): Promise<void> {
  const userContext = getUserContext();
  const userId = getCurrentUserId() || 'unknown';
  const sessionId = userContext?.sessionId || 'unknown';

  // Track the attempt
  const attemptCount = sessionCrossUserTracker.trackAttempt(sessionId);

  // Log the event
  logger.error('Cross-user access attempt detected', {
    event: 'CROSS_USER_ACCESS_ATTEMPT',
    severity: 'critical',
    userId,
    sessionId,
    targetUserId: targetUserId || 'unknown',
    tool: context.tool,
    operation: context.operation,
    model: context.model,
    attemptCount,
  });

  // Create security event in database
  try {
    const prisma = getPrismaClient();
    await prisma.securityEvent.create({
      data: {
        eventType: 'CROSS_USER_ACCESS_ATTEMPT',
        severity: 'critical',
        userId,
        details: {
          targetUserId: targetUserId || 'unknown',
          tool: context.tool,
          operation: context.operation,
          model: context.model,
          sessionId,
          attemptCount,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (dbError) {
    // Don't fail the operation if logging fails
    logger.error('Failed to create cross-user access security event', {
      error: dbError instanceof Error ? dbError.message : 'Unknown error',
    });
  }

  // Check for repeated attempts and create escalation event
  if (attemptCount >= 3) {
    await createRepeatedAttemptsEvent(sessionId, attemptCount);
  }
}

/**
 * Create security event for repeated cross-user access attempts
 */
async function createRepeatedAttemptsEvent(sessionId: string, attemptCount: number): Promise<void> {
  const userId = getCurrentUserId() || 'unknown';

  logger.error('Repeated cross-user access attempts detected', {
    event: 'REPEATED_CROSS_USER_ATTEMPTS',
    severity: 'critical',
    userId,
    sessionId,
    attemptCount,
    recommendation: 'Consider blocking session',
  });

  try {
    const prisma = getPrismaClient();
    await prisma.securityEvent.create({
      data: {
        eventType: 'REPEATED_CROSS_USER_ATTEMPTS',
        severity: 'critical',
        userId,
        details: {
          sessionId,
          attemptCount,
          recommendation: 'Consider blocking session',
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (dbError) {
    logger.error('Failed to create repeated attempts security event', {
      error: dbError instanceof Error ? dbError.message : 'Unknown error',
    });
  }
}

/**
 * Detect cross-user data in query results
 *
 * @param result - The query result to check
 * @param userId - The expected user ID
 * @returns Array of violations (records belonging to other users)
 */
export function detectCrossUserData<T extends { userId?: string }>(
  result: T | T[] | null | undefined,
  userId: string
): Array<{ targetUserId: string }> {
  if (!result) return [];

  const items = Array.isArray(result) ? result : [result];

  return items
    .filter((item): item is T & { userId: string } =>
      item.userId !== undefined && item.userId !== userId
    )
    .map((item) => ({ targetUserId: item.userId }));
}
