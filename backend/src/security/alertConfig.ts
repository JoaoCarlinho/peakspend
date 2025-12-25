/**
 * Alert Configuration Service
 *
 * Manages alert configuration with support for:
 * - YAML configuration files
 * - Environment variable overrides
 * - Zod schema validation
 * - SIGHUP signal for hot reload
 * - EventEmitter for configuration change notifications
 *
 * Usage:
 *   import { alertConfigService } from '@/security';
 *
 *   const config = alertConfigService.getConfig();
 *   alertConfigService.on('config-reloaded', ({ oldConfig, newConfig }) => {
 *     // Update dependent services
 *   });
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';
import logger from '../config/logger';
import { AlertSeverity } from './alertService';

/**
 * Threshold configuration schema
 */
const ThresholdConfigSchema = z.object({
  rapidRequestsPerMinute: z.number().min(1).default(10),
  sequentialBlocksToFlag: z.number().min(1).default(3),
  probingVectorThreshold: z.number().min(1).default(3),
  escalationTrendThreshold: z.number().min(0).max(1).default(0.1),
});

/**
 * Webhook configuration schema
 */
const WebhookConfigSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().min(1000).default(10000),
});

/**
 * Email configuration schema
 */
const EmailConfigSchema = z.object({
  recipients: z.array(z.string().email()).min(1),
  smtpHost: z.string(),
  smtpPort: z.number().min(1).max(65535),
  smtpUser: z.string(),
  smtpPass: z.string(),
  from: z.string().email(),
  secure: z.boolean().optional(),
});

/**
 * Destination configuration schema
 */
const DestinationConfigSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['webhook', 'email']),
  enabled: z.boolean().default(true),
  config: z.union([WebhookConfigSchema, EmailConfigSchema]),
  severities: z.array(z.nativeEnum(AlertSeverity)).min(1),
});

/**
 * Suppression configuration schema
 */
const SuppressionConfigSchema = z.object({
  windowMs: z.number().min(1000).default(300000), // 5 minutes
  confidenceIncrease: z.number().min(0).max(1).default(0.2),
});

/**
 * Retry configuration schema
 */
const RetryConfigSchema = z.object({
  maxAttempts: z.number().min(1).max(10).default(5),
  backoffMultiplier: z.number().min(1).max(5).default(2),
  initialDelayMs: z.number().min(100).default(1000),
});

/**
 * Severity threshold configuration schema
 */
const SeverityThresholdsSchema = z.object({
  critical: z.number().min(0).max(1).default(0.9),
  high: z.number().min(0).max(1).default(0.7),
  medium: z.number().min(0).max(1).default(0.5),
});

/**
 * Default values for nested schemas
 */
const DEFAULT_THRESHOLDS = {
  rapidRequestsPerMinute: 10,
  sequentialBlocksToFlag: 3,
  probingVectorThreshold: 3,
  escalationTrendThreshold: 0.1,
};

const DEFAULT_SEVERITY_THRESHOLDS = {
  critical: 0.9,
  high: 0.7,
  medium: 0.5,
};

const DEFAULT_SUPPRESSION = {
  windowMs: 300000,
  confidenceIncrease: 0.2,
};

const DEFAULT_RETRY = {
  maxAttempts: 5,
  backoffMultiplier: 2,
  initialDelayMs: 1000,
};

/**
 * Full alert configuration schema
 */
const AlertConfigSchema = z.object({
  version: z.string().default('1.0'),
  description: z.string().optional(),
  thresholds: ThresholdConfigSchema.default(DEFAULT_THRESHOLDS),
  severityThresholds: SeverityThresholdsSchema.default(DEFAULT_SEVERITY_THRESHOLDS),
  destinations: z.array(DestinationConfigSchema).default([]),
  suppression: SuppressionConfigSchema.default(DEFAULT_SUPPRESSION),
  retry: RetryConfigSchema.default(DEFAULT_RETRY),
});

/**
 * Alert configuration type
 */
export type AlertConfig = z.infer<typeof AlertConfigSchema>;
export type ThresholdConfig = z.infer<typeof ThresholdConfigSchema>;
export type DestinationConfig = z.infer<typeof DestinationConfigSchema>;
export type SuppressionConfig = z.infer<typeof SuppressionConfigSchema>;
export type RetryConfig = z.infer<typeof RetryConfigSchema>;
export type SeverityThresholds = z.infer<typeof SeverityThresholdsSchema>;

/**
 * Configuration reload event payload
 */
export interface ConfigReloadEvent {
  oldConfig: AlertConfig;
  newConfig: AlertConfig;
}

/**
 * Sanitized destination config (for API response)
 */
export interface SanitizedDestinationConfig {
  name: string;
  type: 'webhook' | 'email';
  enabled: boolean;
  config: Record<string, unknown>;
  severities: AlertSeverity[];
}

/**
 * Alert Configuration Service
 *
 * Singleton service for managing alert configuration with hot reload support.
 */
export class AlertConfigService extends EventEmitter {
  private static instance: AlertConfigService | null = null;

  private config: AlertConfig;
  private configPath: string;
  private lastReloadAt: Date;
  private signalHandler: (() => void) | null = null;

  /**
   * Private constructor - use getInstance()
   */
  private constructor() {
    super();
    this.configPath = this.getConfigPath();
    this.config = this.loadConfiguration();
    this.lastReloadAt = new Date();
    this.setupSignalHandler();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): AlertConfigService {
    if (!AlertConfigService.instance) {
      AlertConfigService.instance = new AlertConfigService();
    }
    return AlertConfigService.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    if (AlertConfigService.instance) {
      AlertConfigService.instance.destroy();
      AlertConfigService.instance = null;
    }
  }

  /**
   * Get current configuration (immutable)
   */
  public getConfig(): Readonly<AlertConfig> {
    return Object.freeze({ ...this.config });
  }

  /**
   * Get last reload timestamp
   */
  public getLastReloadAt(): Date {
    return this.lastReloadAt;
  }

  /**
   * Get sanitized configuration for API response
   * Redacts sensitive values like passwords and tokens
   */
  public getSanitizedConfig(): {
    version: string;
    description?: string;
    thresholds: ThresholdConfig;
    severityThresholds: SeverityThresholds;
    destinations: SanitizedDestinationConfig[];
    suppression: SuppressionConfig;
    retry: RetryConfig;
    lastReloadAt: string;
  } {
    // Build result conditionally for exactOptionalPropertyTypes
    const result: {
      version: string;
      description?: string;
      thresholds: ThresholdConfig;
      severityThresholds: SeverityThresholds;
      destinations: SanitizedDestinationConfig[];
      suppression: SuppressionConfig;
      retry: RetryConfig;
      lastReloadAt: string;
    } = {
      version: this.config.version,
      thresholds: this.config.thresholds,
      severityThresholds: this.config.severityThresholds,
      destinations: this.config.destinations.map((d) => ({
        name: d.name,
        type: d.type,
        enabled: d.enabled,
        config: this.sanitizeDestinationConfig(d.type, d.config),
        severities: d.severities,
      })),
      suppression: this.config.suppression,
      retry: this.config.retry,
      lastReloadAt: this.lastReloadAt.toISOString(),
    };

    if (this.config.description !== undefined) {
      result.description = this.config.description;
    }

    return result;
  }

  /**
   * Manually trigger configuration reload
   */
  public reload(): boolean {
    try {
      const oldConfig = this.config;
      const newConfig = this.loadConfiguration();
      this.config = newConfig;
      this.lastReloadAt = new Date();

      this.emit('config-reloaded', { oldConfig, newConfig });

      logger.info('Alert configuration reloaded manually', {
        event: 'ALERT_CONFIG_RELOADED',
        source: 'manual',
      });

      return true;
    } catch (error) {
      logger.error('Failed to reload alert configuration', {
        event: 'ALERT_CONFIG_RELOAD_ERROR',
        source: 'manual',
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Destroy the service (cleanup signal handlers)
   */
  public destroy(): void {
    if (this.signalHandler) {
      process.removeListener('SIGHUP', this.signalHandler);
      this.signalHandler = null;
    }
    this.removeAllListeners();
    logger.info('AlertConfigService destroyed', {
      event: 'ALERT_CONFIG_SERVICE_DESTROYED',
    });
  }

  /**
   * Get configuration file path
   */
  private getConfigPath(): string {
    const envPath = process.env['ALERT_CONFIG_PATH'];
    if (envPath) {
      return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
    }
    return path.resolve(process.cwd(), 'config', 'alert-config.yaml');
  }

  /**
   * Load configuration from file and environment
   */
  private loadConfiguration(): AlertConfig {
    // Load from file
    let fileConfig: Record<string, unknown> = {};
    try {
      if (fs.existsSync(this.configPath)) {
        const fileContent = fs.readFileSync(this.configPath, 'utf8');
        // Substitute environment variables in YAML content
        const substitutedContent = this.substituteEnvVars(fileContent);
        fileConfig = yaml.load(substitutedContent) as Record<string, unknown>;
        logger.debug('Alert config file loaded', {
          event: 'ALERT_CONFIG_FILE_LOADED',
          path: this.configPath,
        });
      } else {
        logger.info('Alert config file not found, using defaults and env vars', {
          event: 'ALERT_CONFIG_FILE_NOT_FOUND',
          path: this.configPath,
        });
      }
    } catch (error) {
      logger.warn('Error reading alert config file, using defaults', {
        event: 'ALERT_CONFIG_FILE_ERROR',
        path: this.configPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Apply environment variable overrides
    const envOverrides = this.getEnvOverrides();
    const mergedConfig = this.deepMerge(fileConfig, envOverrides);

    // Validate with Zod
    const result = AlertConfigSchema.safeParse(mergedConfig);

    if (!result.success) {
      const errors = result.error.issues.map(
        (e) => `${String(e.path.join('.'))}: ${e.message}`
      );
      const errorMessage = `Invalid alert configuration:\n${errors.join('\n')}`;
      logger.error('Alert configuration validation failed', {
        event: 'ALERT_CONFIG_VALIDATION_ERROR',
        errors: result.error.issues,
      });
      throw new Error(errorMessage);
    }

    logger.info('Alert configuration loaded successfully', {
      event: 'ALERT_CONFIG_LOADED',
      thresholds: result.data.thresholds,
      destinationCount: result.data.destinations.length,
      suppressionWindowMs: result.data.suppression.windowMs,
    });

    return result.data;
  }

  /**
   * Substitute ${VAR_NAME} patterns with environment variable values
   */
  private substituteEnvVars(content: string): string {
    return content.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, varName: string) => {
      const value = process.env[varName];
      if (value === undefined) {
        logger.warn('Environment variable not found for config substitution', {
          event: 'ALERT_CONFIG_ENV_VAR_MISSING',
          variable: varName,
        });
        return '';
      }
      return value;
    });
  }

  /**
   * Get environment variable overrides
   */
  private getEnvOverrides(): Record<string, unknown> {
    const overrides: Record<string, unknown> = {};

    // Threshold overrides
    const thresholds: Record<string, unknown> = {};
    if (process.env['ALERT_RAPID_REQUESTS_THRESHOLD']) {
      thresholds['rapidRequestsPerMinute'] = parseInt(
        process.env['ALERT_RAPID_REQUESTS_THRESHOLD'],
        10
      );
    }
    if (process.env['ALERT_SEQUENTIAL_BLOCKS_THRESHOLD']) {
      thresholds['sequentialBlocksToFlag'] = parseInt(
        process.env['ALERT_SEQUENTIAL_BLOCKS_THRESHOLD'],
        10
      );
    }
    if (process.env['ALERT_PROBING_VECTORS_THRESHOLD']) {
      thresholds['probingVectorThreshold'] = parseInt(
        process.env['ALERT_PROBING_VECTORS_THRESHOLD'],
        10
      );
    }
    if (Object.keys(thresholds).length > 0) {
      overrides['thresholds'] = thresholds;
    }

    // Suppression overrides
    const suppression: Record<string, unknown> = {};
    if (process.env['ALERT_SUPPRESSION_WINDOW_MS']) {
      suppression['windowMs'] = parseInt(process.env['ALERT_SUPPRESSION_WINDOW_MS'], 10);
    }
    if (process.env['ALERT_SUPPRESSION_CONFIDENCE_INCREASE']) {
      suppression['confidenceIncrease'] = parseFloat(
        process.env['ALERT_SUPPRESSION_CONFIDENCE_INCREASE']
      );
    }
    if (Object.keys(suppression).length > 0) {
      overrides['suppression'] = suppression;
    }

    // Retry overrides
    const retry: Record<string, unknown> = {};
    if (process.env['ALERT_RETRY_MAX_ATTEMPTS']) {
      retry['maxAttempts'] = parseInt(process.env['ALERT_RETRY_MAX_ATTEMPTS'], 10);
    }
    if (process.env['ALERT_RETRY_BACKOFF_MULTIPLIER']) {
      retry['backoffMultiplier'] = parseFloat(process.env['ALERT_RETRY_BACKOFF_MULTIPLIER']);
    }
    if (process.env['ALERT_RETRY_INITIAL_DELAY_MS']) {
      retry['initialDelayMs'] = parseInt(process.env['ALERT_RETRY_INITIAL_DELAY_MS'], 10);
    }
    if (Object.keys(retry).length > 0) {
      overrides['retry'] = retry;
    }

    return overrides;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = this.deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue;
      }
    }

    return result;
  }

  /**
   * Setup SIGHUP signal handler for hot reload
   */
  private setupSignalHandler(): void {
    // Only setup on non-Windows platforms
    if (process.platform === 'win32') {
      logger.info('SIGHUP not supported on Windows, hot reload disabled', {
        event: 'ALERT_CONFIG_SIGHUP_DISABLED',
        platform: 'win32',
      });
      return;
    }

    this.signalHandler = () => {
      logger.info('SIGHUP received, reloading alert configuration...', {
        event: 'ALERT_CONFIG_SIGHUP_RECEIVED',
      });

      try {
        const oldConfig = this.config;
        const newConfig = this.loadConfiguration();
        this.config = newConfig;
        this.lastReloadAt = new Date();

        this.emit('config-reloaded', { oldConfig, newConfig });

        logger.info('Alert configuration reloaded via SIGHUP', {
          event: 'ALERT_CONFIG_RELOADED',
          source: 'SIGHUP',
        });
      } catch (error) {
        logger.error('Failed to reload alert configuration via SIGHUP, keeping previous', {
          event: 'ALERT_CONFIG_RELOAD_ERROR',
          source: 'SIGHUP',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    process.on('SIGHUP', this.signalHandler);

    logger.info('SIGHUP handler registered for alert config hot reload', {
      event: 'ALERT_CONFIG_SIGHUP_REGISTERED',
    });
  }

  /**
   * Sanitize destination config by redacting sensitive values
   */
  private sanitizeDestinationConfig(
    type: 'webhook' | 'email',
    config: Record<string, unknown>
  ): Record<string, unknown> {
    const sensitiveKeys = [
      'smtpPass',
      'password',
      'pass',
      'secret',
      'token',
      'apiKey',
      'api_key',
      'authorization',
    ];

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(config)) {
      // Check if key contains sensitive keyword
      const isSensitive = sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()));

      if (isSensitive) {
        result[key] = '***REDACTED***';
      } else if (key === 'headers' && typeof value === 'object' && value !== null) {
        // Sanitize headers object
        const sanitizedHeaders: Record<string, string> = {};
        for (const [headerKey, headerValue] of Object.entries(value as Record<string, string>)) {
          const isHeaderSensitive = sensitiveKeys.some(
            (sk) =>
              headerKey.toLowerCase().includes(sk.toLowerCase()) ||
              headerKey.toLowerCase() === 'authorization'
          );
          sanitizedHeaders[headerKey] = isHeaderSensitive
            ? '***REDACTED***'
            : String(headerValue);
        }
        result[key] = sanitizedHeaders;
      } else {
        result[key] = value;
      }
    }

    // Add type-specific info
    if (type === 'webhook') {
      result['_type'] = 'webhook';
    } else {
      result['_type'] = 'email';
      // Show recipient count instead of list for privacy
      if (Array.isArray(config['recipients'])) {
        result['recipientCount'] = config['recipients'].length;
      }
    }

    return result;
  }
}

// Export singleton instance
export const alertConfigService = AlertConfigService.getInstance();
