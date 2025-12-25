/**
 * Alert Service
 *
 * Generates and manages security alerts based on detected anomalies.
 * Supports async alert delivery via Bull queue with duplicate suppression.
 *
 * Features:
 * - Alert generation from anomaly detection results
 * - Severity classification (LOW, MEDIUM, HIGH, CRITICAL)
 * - Duplicate suppression within configurable window
 * - Async non-blocking alert processing
 * - SecurityEvent persistence
 *
 * Usage:
 *   import { alertService } from '@/security';
 *
 *   const alert = await alertService.generateAlert(anomalyResult, context);
 *   if (alert) {
 *     // Alert was generated and queued
 *   }
 */

import { v4 as uuidv4 } from 'uuid';
import { securityConfigService } from './securityConfig.service';
import { getPrismaClient } from '../config/database';
import logger from '../config/logger';
import {
  AnomalyDetectionResult,
  AnomalyPattern,
  AnomalyPatternType,
} from './anomalyDetector.service';

/**
 * Alert severity levels
 */
export enum AlertSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Security context for alert generation
 */
export interface SecurityContext {
  userId: string;
  sessionId: string;
  endpoint?: string;
  requestCount?: number;
  blockedCount?: number;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * A security alert
 */
export interface Alert {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  userId: string;
  sessionId: string;
  patterns: AnomalyPattern[];
  overallConfidence: number;
  recommendation: string;
  context: {
    endpoint?: string;
    requestCount?: number;
    blockedCount?: number;
    ipAddress?: string;
  };
  suppressed: boolean;
  securityEventId?: string;
}

/**
 * Alert service configuration
 */
export interface AlertServiceConfig {
  suppressionWindowMs: number; // Default: 5 minutes
  confidenceIncreaseThreshold: number; // Re-alert if confidence increases by this much
  severityThresholds: {
    critical: number;
    high: number;
    medium: number;
  };
}

/**
 * Alert Service
 *
 * Singleton service for generating and managing security alerts.
 */
export class AlertService {
  private static instance: AlertService | null = null;

  // Track recent alerts per session for duplicate suppression
  private recentAlerts: Map<string, Alert[]> = new Map();
  private config: AlertServiceConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Default configuration
   */
  private static readonly DEFAULT_CONFIG: AlertServiceConfig = {
    suppressionWindowMs: 5 * 60 * 1000, // 5 minutes
    confidenceIncreaseThreshold: 0.2,
    severityThresholds: {
      critical: 0.9,
      high: 0.7,
      medium: 0.5,
    },
  };

  private constructor(config?: Partial<AlertServiceConfig>) {
    this.config = {
      ...AlertService.DEFAULT_CONFIG,
      ...config,
    };

    this.startCleanupInterval();

    logger.info('AlertService initialized', {
      event: 'ALERT_SERVICE_INIT',
      config: {
        suppressionWindowMs: this.config.suppressionWindowMs,
        confidenceIncreaseThreshold: this.config.confidenceIncreaseThreshold,
      },
    });
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<AlertServiceConfig>): AlertService {
    if (!AlertService.instance) {
      AlertService.instance = new AlertService(config);
    }
    return AlertService.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    if (AlertService.instance) {
      AlertService.instance.destroy();
      AlertService.instance = null;
    }
  }

  /**
   * Generate an alert from an anomaly detection result
   *
   * @returns Alert if generated, null if suppressed
   */
  public async generateAlert(
    anomalyResult: AnomalyDetectionResult,
    context: SecurityContext
  ): Promise<Alert | null> {
    // Check if anomaly detection/alerting is enabled
    if (!securityConfigService.isFeatureEnabled('ANOMALY_DETECTION_ENABLED')) {
      return null;
    }

    // Skip if no anomalies detected
    if (!anomalyResult.isAnomalous || anomalyResult.patterns.length === 0) {
      return null;
    }

    // Check for duplicate suppression
    if (this.isDuplicate(anomalyResult.sessionId, anomalyResult.patterns)) {
      logger.debug('Alert suppressed as duplicate', {
        event: 'ALERT_SUPPRESSED',
        sessionId: anomalyResult.sessionId,
        reason: 'duplicate_within_window',
      });
      return null;
    }

    // Create alert - build context object conditionally to satisfy exactOptionalPropertyTypes
    const alertContext: Alert['context'] = {};
    if (context.endpoint !== undefined) {
      alertContext.endpoint = context.endpoint;
    }
    if (context.requestCount !== undefined) {
      alertContext.requestCount = context.requestCount;
    }
    if (context.blockedCount !== undefined) {
      alertContext.blockedCount = context.blockedCount;
    }
    if (context.ipAddress !== undefined) {
      alertContext.ipAddress = context.ipAddress;
    }

    const alert: Alert = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      severity: this.classifySeverity(anomalyResult),
      userId: context.userId,
      sessionId: anomalyResult.sessionId,
      patterns: anomalyResult.patterns,
      overallConfidence: anomalyResult.overallConfidence,
      recommendation: anomalyResult.recommendation,
      context: alertContext,
      suppressed: false,
    };

    // Store in SecurityEvent table
    try {
      const securityEvent = await this.createSecurityEvent(alert);
      alert.securityEventId = securityEvent.id;
    } catch (error) {
      logger.error('Failed to create SecurityEvent for alert', {
        event: 'ALERT_SECURITY_EVENT_ERROR',
        alertId: alert.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue without persisting - alert is still valid
    }

    // Track for duplicate suppression
    this.trackRecentAlert(alert);

    // Log alert generation
    logger.warn('Security alert generated', {
      event: 'ALERT_GENERATED',
      alertId: alert.id,
      severity: alert.severity,
      sessionId: alert.sessionId,
      userId: alert.userId,
      patternCount: alert.patterns.length,
      patterns: alert.patterns.map((p) => p.type),
      confidence: alert.overallConfidence,
      recommendation: alert.recommendation,
    });

    return alert;
  }

  /**
   * Classify alert severity based on anomaly detection result
   */
  private classifySeverity(result: AnomalyDetectionResult): AlertSeverity {
    const thresholds = this.config.severityThresholds;

    // CRITICAL: Very high confidence or BLOCK_SESSION recommendation
    if (
      result.overallConfidence >= thresholds.critical ||
      result.recommendation === 'BLOCK_SESSION'
    ) {
      return AlertSeverity.CRITICAL;
    }

    // Check for high-risk patterns that warrant HIGH severity
    const hasSequentialInjection = result.patterns.some(
      (p) => p.type === AnomalyPatternType.SEQUENTIAL_INJECTION && p.confidence > 0.7
    );
    if (hasSequentialInjection) {
      return AlertSeverity.HIGH;
    }

    // HIGH: High confidence or multiple high-weight patterns
    if (result.overallConfidence >= thresholds.high) {
      return AlertSeverity.HIGH;
    }

    // MEDIUM: Multiple patterns or medium confidence
    if (result.patterns.length >= 2 || result.overallConfidence >= thresholds.medium) {
      return AlertSeverity.MEDIUM;
    }

    // LOW: Single low-confidence pattern
    return AlertSeverity.LOW;
  }

  /**
   * Check if this alert is a duplicate of a recent one
   */
  private isDuplicate(sessionId: string, patterns: AnomalyPattern[]): boolean {
    const recentForSession = this.recentAlerts.get(sessionId) ?? [];
    const cutoff = Date.now() - this.config.suppressionWindowMs;

    // Filter to recent alerts
    const recent = recentForSession.filter((a) => new Date(a.timestamp).getTime() > cutoff);

    if (recent.length === 0) return false;

    // Check if same pattern types were alerted
    const currentPatternTypes = new Set(patterns.map((p) => p.type));

    for (const recentAlert of recent) {
      const recentPatternTypes = new Set(recentAlert.patterns.map((p) => p.type));
      const hasOverlap = [...currentPatternTypes].some((t) => recentPatternTypes.has(t));

      if (hasOverlap) {
        // Allow re-alert if confidence significantly higher
        const maxRecentConfidence = Math.max(...recentAlert.patterns.map((p) => p.confidence));
        const maxCurrentConfidence = Math.max(...patterns.map((p) => p.confidence));

        if (maxCurrentConfidence <= maxRecentConfidence + this.config.confidenceIncreaseThreshold) {
          return true; // Suppress duplicate
        }
      }
    }

    return false;
  }

  /**
   * Track alert for duplicate suppression
   */
  private trackRecentAlert(alert: Alert): void {
    const sessionAlerts = this.recentAlerts.get(alert.sessionId) ?? [];
    sessionAlerts.push(alert);

    // Keep only alerts within suppression window
    const cutoff = Date.now() - this.config.suppressionWindowMs;
    const filtered = sessionAlerts.filter((a) => new Date(a.timestamp).getTime() > cutoff);

    this.recentAlerts.set(alert.sessionId, filtered);
  }

  /**
   * Create SecurityEvent record for alert
   */
  private async createSecurityEvent(alert: Alert): Promise<{ id: string }> {
    const prisma = getPrismaClient();

    const event = await prisma.securityEvent.create({
      data: {
        eventType: 'ANOMALY_ALERT',
        severity: alert.severity,
        userId: alert.userId,
        details: JSON.parse(
          JSON.stringify({
            alertId: alert.id,
            sessionId: alert.sessionId,
            patterns: alert.patterns.map((p) => ({
              type: p.type,
              confidence: p.confidence,
              details: p.details,
            })),
            overallConfidence: alert.overallConfidence,
            recommendation: alert.recommendation,
            context: alert.context,
          })
        ),
        status: 'PENDING',
        alertSent: false,
      },
    });

    return { id: event.id };
  }

  /**
   * Mark alert as sent (called by destinations)
   */
  public async markAlertSent(alertId: string, destinations: string[]): Promise<void> {
    const prisma = getPrismaClient();

    await prisma.securityEvent.updateMany({
      where: {
        eventType: 'ANOMALY_ALERT',
        details: {
          path: ['alertId'],
          equals: alertId,
        },
      },
      data: {
        alertSent: true,
        alertDestinations: destinations,
      },
    });

    logger.debug('Alert marked as sent', {
      event: 'ALERT_MARKED_SENT',
      alertId,
      destinations,
    });
  }

  /**
   * Get recent alerts for a session
   */
  public getRecentAlerts(sessionId: string): Alert[] {
    const alerts = this.recentAlerts.get(sessionId) ?? [];
    const cutoff = Date.now() - this.config.suppressionWindowMs;
    return alerts.filter((a) => new Date(a.timestamp).getTime() > cutoff);
  }

  /**
   * Get alert by ID from recent cache
   */
  public getAlertById(alertId: string): Alert | null {
    for (const alerts of this.recentAlerts.values()) {
      const found = alerts.find((a) => a.id === alertId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<AlertServiceConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('AlertService config updated', {
      event: 'ALERT_SERVICE_CONFIG_UPDATED',
      config,
    });
  }

  /**
   * Get current configuration
   */
  public getConfig(): Readonly<AlertServiceConfig> {
    return Object.freeze({ ...this.config });
  }

  /**
   * Start periodic cleanup of old alerts
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(
      () => {
        const cutoff = Date.now() - this.config.suppressionWindowMs;
        let totalRemoved = 0;

        for (const [sessionId, alerts] of this.recentAlerts.entries()) {
          const before = alerts.length;
          const filtered = alerts.filter((a) => new Date(a.timestamp).getTime() > cutoff);
          this.recentAlerts.set(sessionId, filtered);
          totalRemoved += before - filtered.length;

          // Remove empty entries
          if (filtered.length === 0) {
            this.recentAlerts.delete(sessionId);
          }
        }

        if (totalRemoved > 0) {
          logger.debug('Alert cleanup completed', {
            event: 'ALERT_CLEANUP',
            removedCount: totalRemoved,
            sessionCount: this.recentAlerts.size,
          });
        }
      },
      60 * 1000
    ); // Run every minute

    // Don't prevent Node from exiting
    this.cleanupInterval.unref();
  }

  /**
   * Destroy the service
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.recentAlerts.clear();
    logger.info('AlertService destroyed', { event: 'ALERT_SERVICE_DESTROYED' });
  }

  /**
   * Clear all tracked alerts (for testing)
   */
  public clearAlerts(): void {
    this.recentAlerts.clear();
  }
}

// Export singleton instance
export const alertService = AlertService.getInstance();
