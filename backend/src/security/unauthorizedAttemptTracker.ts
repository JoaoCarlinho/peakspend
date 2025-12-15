/**
 * Unauthorized Attempt Tracker
 *
 * Tracks unauthorized tool invocation attempts and triggers alerts when
 * thresholds are exceeded. Creates security events for audit purposes.
 *
 * Features:
 * - Creates security events for each unauthorized attempt
 * - Tracks attempts per user/session with sliding window
 * - Triggers alerts when threshold exceeded
 * - Parameter sanitization for sensitive data
 *
 * Usage:
 *   import { attemptTracker } from '@/security';
 *
 *   // Track an unauthorized attempt
 *   await attemptTracker.trackAttempt(userId, sessionId, toolName, role, requiredRoles, parameters);
 */

import { getPrismaClient } from '../config/database';
import logger from '../config/logger';

/**
 * Attempt record for threshold tracking
 */
interface AttemptRecord {
  count: number;
  tools: Set<string>;
  firstAttempt: number;
}

/**
 * Configuration for attempt tracking
 */
interface TrackerConfig {
  threshold: number;
  windowMs: number;
}

/**
 * Severity levels for security events
 */
type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Unauthorized Attempt Tracker
 *
 * Singleton service for tracking unauthorized tool access attempts.
 */
export class UnauthorizedAttemptTracker {
  private static instance: UnauthorizedAttemptTracker | null = null;

  // In-memory tracking of attempts per user/session
  private attempts: Map<string, AttemptRecord> = new Map();

  // Configuration
  private readonly config: TrackerConfig = {
    threshold: 3, // Number of attempts before alert
    windowMs: 5 * 60 * 1000, // 5 minutes
  };

  // Tools considered sensitive (higher severity when accessed)
  private readonly sensitiveTools = [
    'getAuditLogs',
    'getSecurityEvents',
    'getAllUsersExpenses',
    'getUserExpenses',
    'getUserStats',
    'exportAuditLogs',
    'reviewFlaggedContent',
    'getSystemMetrics',
  ];

  // Sensitive parameter keys to redact
  private readonly sensitiveKeys = [
    'password',
    'token',
    'secret',
    'ssn',
    'creditcard',
    'key',
    'auth',
    'apikey',
    'api_key',
    'bearer',
  ];

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): UnauthorizedAttemptTracker {
    if (!UnauthorizedAttemptTracker.instance) {
      UnauthorizedAttemptTracker.instance = new UnauthorizedAttemptTracker();
    }
    return UnauthorizedAttemptTracker.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    UnauthorizedAttemptTracker.instance = null;
  }

  /**
   * Track an unauthorized tool access attempt
   *
   * @param userId - User ID making the attempt
   * @param sessionId - Session ID for the request
   * @param toolName - Tool that was attempted
   * @param role - User's current role
   * @param requiredRoles - Roles required for the tool
   * @param parameters - Parameters passed to the tool (will be sanitized)
   */
  public async trackAttempt(
    userId: string,
    sessionId: string | null,
    toolName: string,
    role: string,
    requiredRoles: string[],
    parameters: Record<string, unknown> = {}
  ): Promise<void> {
    // Create security event for this attempt
    await this.createSecurityEvent(userId, sessionId, toolName, role, requiredRoles, parameters);

    // Track for threshold detection
    const key = sessionId ? `${userId}:${sessionId}` : userId;
    const now = Date.now();
    let record = this.attempts.get(key);

    if (!record || now - record.firstAttempt > this.config.windowMs) {
      // New window
      record = {
        count: 1,
        tools: new Set([toolName]),
        firstAttempt: now,
      };
      this.attempts.set(key, record);
    } else {
      // Increment in current window
      record.count++;
      record.tools.add(toolName);
    }

    // Check threshold
    if (record.count >= this.config.threshold) {
      await this.handleThresholdExceeded(userId, sessionId, record);
      // Reset to prevent spam
      this.attempts.delete(key);
    }
  }

  /**
   * Create a security event for an unauthorized attempt
   */
  private async createSecurityEvent(
    userId: string,
    sessionId: string | null,
    toolName: string,
    role: string,
    requiredRoles: string[],
    parameters: Record<string, unknown>
  ): Promise<void> {
    const sanitizedParams = this.sanitizeParameters(parameters);
    const severity = this.getSeverity(toolName);

    try {
      const prisma = getPrismaClient();
      await prisma.securityEvent.create({
        data: {
          eventType: 'UNAUTHORIZED_TOOL_INVOCATION',
          severity,
          userId,
          details: JSON.parse(
            JSON.stringify({
              toolName,
              userRole: role,
              requiredRoles,
              parameters: sanitizedParams,
              sessionId: sessionId || undefined,
              timestamp: new Date().toISOString(),
            })
          ),
          status: 'PENDING',
          alertSent: false,
        },
      });

      logger.warn('Unauthorized tool invocation attempt', {
        event: 'UNAUTHORIZED_TOOL_INVOCATION',
        userId,
        toolName,
        role,
        requiredRoles,
        severity,
      });
    } catch (error) {
      // Don't fail the request if logging fails
      logger.error('Failed to create security event for unauthorized attempt', {
        event: 'SECURITY_EVENT_ERROR',
        error: error instanceof Error ? error.message : String(error),
        userId,
        toolName,
      });
    }
  }

  /**
   * Handle threshold exceeded - create high severity event and trigger alert
   */
  private async handleThresholdExceeded(
    userId: string,
    sessionId: string | null,
    record: AttemptRecord
  ): Promise<void> {
    try {
      const prisma = getPrismaClient();
      await prisma.securityEvent.create({
        data: {
          eventType: 'REPEATED_UNAUTHORIZED_ATTEMPTS',
          severity: 'HIGH',
          userId,
          details: JSON.parse(
            JSON.stringify({
              attemptCount: record.count,
              windowMinutes: Math.round(this.config.windowMs / 60000),
              toolsAttempted: Array.from(record.tools),
              sessionId: sessionId || undefined,
              timestamp: new Date().toISOString(),
            })
          ),
          status: 'PENDING',
          alertSent: false,
        },
      });

      logger.error('REPEATED UNAUTHORIZED ATTEMPTS DETECTED', {
        event: 'REPEATED_UNAUTHORIZED_ATTEMPTS',
        userId,
        sessionId,
        attemptCount: record.count,
        tools: Array.from(record.tools),
      });

      // Trigger alert
      await this.triggerAlert(userId, sessionId, record);
    } catch (error) {
      logger.error('Failed to create repeated attempts security event', {
        event: 'SECURITY_EVENT_ERROR',
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
    }
  }

  /**
   * Trigger an alert for repeated unauthorized attempts
   * This is a stub for Epic 8 alert service integration
   */
  private async triggerAlert(
    userId: string,
    sessionId: string | null,
    record: AttemptRecord
  ): Promise<void> {
    // Log the alert trigger for now
    // TODO: Integrate with Epic 8 alert service when available
    logger.warn('Security alert triggered: REPEATED_UNAUTHORIZED_ATTEMPTS', {
      event: 'SECURITY_ALERT_TRIGGERED',
      alertType: 'REPEATED_UNAUTHORIZED_ATTEMPTS',
      userId,
      sessionId,
      attemptCount: record.count,
      tools: Array.from(record.tools),
      windowMinutes: Math.round(this.config.windowMs / 60000),
    });

    // Mark alert as sent by updating the most recent event
    try {
      const prisma = getPrismaClient();
      await prisma.securityEvent.updateMany({
        where: {
          userId,
          eventType: 'REPEATED_UNAUTHORIZED_ATTEMPTS',
          alertSent: false,
        },
        data: {
          alertSent: true,
        },
      });
    } catch (error) {
      logger.error('Failed to mark alert as sent', {
        event: 'ALERT_UPDATE_ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Determine severity based on tool sensitivity
   */
  private getSeverity(toolName: string): Severity {
    if (this.sensitiveTools.includes(toolName)) {
      return 'HIGH';
    }
    return 'MEDIUM';
  }

  /**
   * Sanitize parameters to remove sensitive data before logging
   */
  private sanitizeParameters(params: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      // Check if key contains sensitive terms
      const isSensitive = this.sensitiveKeys.some((sk) => key.toLowerCase().includes(sk));

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 100) {
        sanitized[key] = value.substring(0, 100) + '...[truncated]';
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeParameters(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Get current attempt count for a user/session (for testing/debugging)
   */
  public getAttemptCount(userId: string, sessionId?: string): number {
    const key = sessionId ? `${userId}:${sessionId}` : userId;
    const record = this.attempts.get(key);
    return record?.count ?? 0;
  }

  /**
   * Clear all attempt tracking (for testing)
   */
  public clearAttempts(): void {
    this.attempts.clear();
  }

  /**
   * Cleanup expired entries (call periodically)
   */
  public cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.attempts.entries()) {
      if (now - record.firstAttempt > this.config.windowMs) {
        this.attempts.delete(key);
      }
    }
  }

  /**
   * Update configuration (for testing)
   */
  public updateConfig(config: Partial<TrackerConfig>): void {
    if (config.threshold !== undefined) {
      (this.config as TrackerConfig).threshold = config.threshold;
    }
    if (config.windowMs !== undefined) {
      (this.config as TrackerConfig).windowMs = config.windowMs;
    }
  }
}

// Export singleton instance
export const attemptTracker = UnauthorizedAttemptTracker.getInstance();
