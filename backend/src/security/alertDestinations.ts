/**
 * Alert Destinations Service
 *
 * Handles delivery of security alerts to external systems.
 * Supports webhook and email destinations with retry logic.
 *
 * Features:
 * - Webhook delivery via HTTP POST
 * - Email delivery via nodemailer
 * - Severity-based routing
 * - Exponential backoff retry
 * - Delivery status logging
 *
 * Usage:
 *   import { alertDestinationService } from '@/security';
 *
 *   const results = await alertDestinationService.deliverAlert(alert);
 */

import nodemailer from 'nodemailer';
import { Alert, AlertSeverity, alertService } from './alertService';
import { securityConfigService } from './securityConfig.service';
import logger from '../config/logger';

/**
 * Webhook destination configuration
 */
export interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Email destination configuration
 */
export interface EmailConfig {
  recipients: string[];
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  from: string;
  secure?: boolean;
}

/**
 * Alert destination configuration
 */
export interface AlertDestination {
  name: string;
  type: 'webhook' | 'email';
  config: WebhookConfig | EmailConfig;
  severities: AlertSeverity[];
  enabled: boolean;
}

/**
 * Result of a delivery attempt
 */
export interface DeliveryResult {
  destination: string;
  type: 'webhook' | 'email';
  success: boolean;
  latencyMs: number;
  error?: string;
  retryCount?: number;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Alert Destinations Service configuration
 */
export interface AlertDestinationsConfig {
  destinations: AlertDestination[];
  retry: RetryConfig;
  defaultWebhookTimeoutMs: number;
}

/**
 * Alert Destinations Service
 *
 * Singleton service for delivering alerts to external destinations.
 */
export class AlertDestinationService {
  private static instance: AlertDestinationService | null = null;

  private config: AlertDestinationsConfig;
  private emailTransporters: Map<string, nodemailer.Transporter> = new Map();

  /**
   * Default configuration
   */
  private static readonly DEFAULT_CONFIG: AlertDestinationsConfig = {
    destinations: [],
    retry: {
      maxAttempts: 5,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
    },
    defaultWebhookTimeoutMs: 10000,
  };

  private constructor(config?: Partial<AlertDestinationsConfig>) {
    this.config = {
      ...AlertDestinationService.DEFAULT_CONFIG,
      ...config,
    };

    // Load destinations from environment if available
    this.loadDestinationsFromEnv();

    logger.info('AlertDestinationService initialized', {
      event: 'ALERT_DESTINATIONS_INIT',
      destinationCount: this.config.destinations.length,
      destinations: this.config.destinations.map((d) => ({
        name: d.name,
        type: d.type,
        severities: d.severities,
        enabled: d.enabled,
      })),
    });
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<AlertDestinationsConfig>): AlertDestinationService {
    if (!AlertDestinationService.instance) {
      AlertDestinationService.instance = new AlertDestinationService(config);
    }
    return AlertDestinationService.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    if (AlertDestinationService.instance) {
      AlertDestinationService.instance.destroy();
      AlertDestinationService.instance = null;
    }
  }

  /**
   * Deliver an alert to all applicable destinations
   */
  public async deliverAlert(alert: Alert): Promise<DeliveryResult[]> {
    // Check if anomaly detection is enabled
    if (!securityConfigService.isFeatureEnabled('ANOMALY_DETECTION_ENABLED')) {
      return [];
    }

    const applicableDestinations = this.getDestinationsForSeverity(alert.severity);
    const results: DeliveryResult[] = [];

    for (const destination of applicableDestinations) {
      if (!destination.enabled) continue;

      const result = await this.deliverToDestinationWithRetry(alert, destination);
      results.push(result);

      // Log delivery status
      logger.info(result.success ? 'Alert delivered' : 'Alert delivery failed', {
        event: result.success ? 'ALERT_DELIVERED' : 'ALERT_DELIVERY_FAILED',
        alertId: alert.id,
        destination: destination.name,
        type: destination.type,
        latencyMs: result.latencyMs,
        error: result.error,
        retryCount: result.retryCount,
      });
    }

    // Update alert sent status in database
    if (results.some((r) => r.success)) {
      const successfulDestinations = results.filter((r) => r.success).map((r) => r.destination);
      await alertService.markAlertSent(alert.id, successfulDestinations);
    }

    return results;
  }

  /**
   * Get destinations applicable for a severity level
   */
  private getDestinationsForSeverity(severity: AlertSeverity): AlertDestination[] {
    return this.config.destinations.filter((d) => d.severities.includes(severity));
  }

  /**
   * Deliver to a destination with retry logic
   */
  private async deliverToDestinationWithRetry(
    alert: Alert,
    destination: AlertDestination
  ): Promise<DeliveryResult> {
    const { maxAttempts, initialDelayMs, backoffMultiplier } = this.config.retry;
    let lastError: string | undefined;
    let attempt = 0;
    const startTime = Date.now();

    while (attempt < maxAttempts) {
      attempt++;

      const result = await this.deliverToDestination(alert, destination);

      if (result.success) {
        return {
          ...result,
          retryCount: attempt - 1,
        };
      }

      lastError = result.error;

      // Calculate delay with exponential backoff
      if (attempt < maxAttempts) {
        const delay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
        logger.debug('Retrying alert delivery', {
          event: 'ALERT_RETRY_SCHEDULED',
          alertId: alert.id,
          destination: destination.name,
          attempt,
          delayMs: delay,
        });
        await this.sleep(delay);
      }
    }

    logger.error('Alert delivery exhausted all retries', {
      event: 'ALERT_DELIVERY_EXHAUSTED',
      alertId: alert.id,
      destination: destination.name,
      attempts: attempt,
      lastError,
    });

    const result: DeliveryResult = {
      destination: destination.name,
      type: destination.type,
      success: false,
      latencyMs: Date.now() - startTime,
      retryCount: attempt - 1,
    };
    if (lastError !== undefined) {
      result.error = lastError;
    }
    return result;
  }

  /**
   * Deliver to a single destination (no retry)
   */
  private async deliverToDestination(
    alert: Alert,
    destination: AlertDestination
  ): Promise<DeliveryResult> {
    if (destination.type === 'webhook') {
      return this.deliverToWebhook(alert, destination.config as WebhookConfig, destination.name);
    } else {
      return this.deliverToEmail(alert, destination.config as EmailConfig, destination.name);
    }
  }

  /**
   * Deliver alert to webhook destination
   */
  private async deliverToWebhook(
    alert: Alert,
    config: WebhookConfig,
    name: string
  ): Promise<DeliveryResult> {
    const startTime = Date.now();
    const timeoutMs = config.timeoutMs ?? this.config.defaultWebhookTimeoutMs;

    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: JSON.stringify({
          alert: {
            id: alert.id,
            timestamp: alert.timestamp,
            severity: alert.severity,
            userId: alert.userId,
            sessionId: alert.sessionId,
            patterns: alert.patterns.map((p) => ({
              type: p.type,
              confidence: p.confidence,
            })),
            confidence: alert.overallConfidence,
            recommendation: alert.recommendation,
          },
          source: 'PeakSpend Security',
          version: '1.0',
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return {
        destination: name,
        type: 'webhook',
        success: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        destination: name,
        type: 'webhook',
        success: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Deliver alert to email destination
   */
  private async deliverToEmail(
    alert: Alert,
    config: EmailConfig,
    name: string
  ): Promise<DeliveryResult> {
    const startTime = Date.now();

    try {
      const transporter = this.getOrCreateTransporter(name, config);

      const severityColors: Record<AlertSeverity, string> = {
        [AlertSeverity.LOW]: '#28a745',
        [AlertSeverity.MEDIUM]: '#ffc107',
        [AlertSeverity.HIGH]: '#fd7e14',
        [AlertSeverity.CRITICAL]: '#dc3545',
      };

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: ${severityColors[alert.severity]}; color: white; padding: 16px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0;">Security Alert: ${alert.severity}</h2>
          </div>
          <div style="padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Timestamp:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${alert.timestamp}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Session ID:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${alert.sessionId}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>User ID:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${alert.userId}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Confidence:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${(alert.overallConfidence * 100).toFixed(1)}%</td>
              </tr>
            </table>

            <h3 style="margin-top: 20px;">Detected Patterns:</h3>
            <ul style="margin: 0; padding-left: 20px;">
              ${alert.patterns
                .map(
                  (p) => `
                <li style="margin: 8px 0;">
                  <strong>${p.type}</strong>: ${(p.confidence * 100).toFixed(1)}% confidence
                </li>
              `
                )
                .join('')}
            </ul>

            <div style="margin-top: 20px; padding: 12px; background-color: #f8f9fa; border-radius: 4px;">
              <strong>Recommendation:</strong> ${alert.recommendation}
            </div>

            <hr style="margin-top: 24px; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 12px; margin-bottom: 0;">
              This alert was generated by PeakSpend Security System.<br>
              Alert ID: ${alert.id}
            </p>
          </div>
        </div>
      `;

      const subject = `[${alert.severity}] PeakSpend Security Alert - ${alert.patterns[0]?.type || 'Anomaly Detected'}`;

      await transporter.sendMail({
        from: config.from,
        to: config.recipients.join(', '),
        subject,
        html,
      });

      return {
        destination: name,
        type: 'email',
        success: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        destination: name,
        type: 'email',
        success: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get or create email transporter
   */
  private getOrCreateTransporter(name: string, config: EmailConfig): nodemailer.Transporter {
    let transporter = this.emailTransporters.get(name);
    if (!transporter) {
      transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.secure ?? config.smtpPort === 465,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass,
        },
      });
      this.emailTransporters.set(name, transporter);
    }
    return transporter;
  }

  /**
   * Load destinations from environment variables
   */
  private loadDestinationsFromEnv(): void {
    // Webhook from env
    const webhookUrl = process.env['ALERT_WEBHOOK_URL'];
    if (webhookUrl) {
      const webhookHeaders: Record<string, string> = {};
      const authHeader = process.env['ALERT_WEBHOOK_AUTH'];
      if (authHeader) {
        webhookHeaders['Authorization'] = authHeader;
      }

      this.config.destinations.push({
        name: 'env-webhook',
        type: 'webhook',
        config: {
          url: webhookUrl,
          headers: webhookHeaders,
          timeoutMs: this.config.defaultWebhookTimeoutMs,
        },
        severities: [AlertSeverity.LOW, AlertSeverity.MEDIUM, AlertSeverity.HIGH, AlertSeverity.CRITICAL],
        enabled: true,
      });
    }

    // Email from env
    const smtpHost = process.env['SMTP_HOST'];
    const emailRecipients = process.env['ALERT_EMAIL_RECIPIENTS'];
    if (smtpHost && emailRecipients) {
      this.config.destinations.push({
        name: 'env-email',
        type: 'email',
        config: {
          recipients: emailRecipients.split(',').map((e) => e.trim()),
          smtpHost,
          smtpPort: parseInt(process.env['SMTP_PORT'] || '587', 10),
          smtpUser: process.env['SMTP_USER'] || '',
          smtpPass: process.env['SMTP_PASS'] || '',
          from: process.env['ALERT_EMAIL_FROM'] || 'security-alerts@peakspend.com',
        },
        severities: [AlertSeverity.HIGH, AlertSeverity.CRITICAL],
        enabled: true,
      });
    }
  }

  /**
   * Add a destination programmatically
   */
  public addDestination(destination: AlertDestination): void {
    this.config.destinations.push(destination);
    logger.info('Alert destination added', {
      event: 'ALERT_DESTINATION_ADDED',
      name: destination.name,
      type: destination.type,
      severities: destination.severities,
    });
  }

  /**
   * Remove a destination
   */
  public removeDestination(name: string): boolean {
    const index = this.config.destinations.findIndex((d) => d.name === name);
    if (index >= 0) {
      this.config.destinations.splice(index, 1);
      this.emailTransporters.delete(name);
      logger.info('Alert destination removed', {
        event: 'ALERT_DESTINATION_REMOVED',
        name,
      });
      return true;
    }
    return false;
  }

  /**
   * Get all configured destinations
   */
  public getDestinations(): AlertDestination[] {
    return [...this.config.destinations];
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<AlertDestinationsConfig>): void {
    this.config = { ...this.config, ...config };
    // Clear cached transporters if destinations changed
    if (config.destinations) {
      this.emailTransporters.clear();
    }
    logger.info('AlertDestinationService config updated', {
      event: 'ALERT_DESTINATIONS_CONFIG_UPDATED',
    });
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Destroy the service
   */
  public destroy(): void {
    for (const transporter of this.emailTransporters.values()) {
      transporter.close();
    }
    this.emailTransporters.clear();
    logger.info('AlertDestinationService destroyed', {
      event: 'ALERT_DESTINATIONS_DESTROYED',
    });
  }
}

// Export singleton instance
export const alertDestinationService = AlertDestinationService.getInstance();
