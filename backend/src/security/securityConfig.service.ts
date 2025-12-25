import {
  loadSecurityConfig,
  logSecurityConfig,
  SecurityConfig,
  SecurityMode,
  FeatureFlag,
  FeatureFlagState,
} from '../config/security.config';
import logger from '../config/logger';
import { getPrismaClient } from '../config/database';

/**
 * Security status returned by getSecurityStatus()
 */
export interface SecurityStatus {
  mode: SecurityMode;
  flags: FeatureFlagState;
  initializedAt: string;
  uptimeMs: number;
}

/**
 * SecurityConfigService - Singleton service for security configuration access
 *
 * Provides a centralized, type-safe interface for accessing security configuration
 * across all security components. Validates configuration on initialization and
 * logs the security state.
 *
 * Usage:
 *   import { securityConfigService } from '@/security';
 *   if (securityConfigService.isFeatureEnabled('INPUT_INSPECTION_ENABLED')) { ... }
 */
export class SecurityConfigService {
  private static instance: SecurityConfigService;
  private readonly config: SecurityConfig;
  private readonly modeInitializedAt: Date;

  /**
   * Private constructor - use getInstance() to access the singleton
   * Validates configuration and logs state on initialization
   */
  private constructor() {
    try {
      this.config = loadSecurityConfig();
      this.modeInitializedAt = new Date();
      logSecurityConfig(this.config);
      this.logModeInitialization();
    } catch (error) {
      logger.error('Failed to initialize SecurityConfigService', { error });
      throw error;
    }
  }

  /**
   * Log security mode initialization and create security event
   * Called during service construction
   */
  private logModeInitialization(): void {
    // Console banner for vulnerable mode
    if (this.config.mode === 'vulnerable') {
      logger.warn('='.repeat(60));
      logger.warn('WARNING: SECURITY_MODE=vulnerable');
      logger.warn('All security controls are DISABLED');
      logger.warn('DO NOT use in production!');
      logger.warn('='.repeat(60));
    }

    logger.info('Security mode initialized', {
      event: 'SECURITY_MODE_INITIALIZED',
      mode: this.config.mode,
      flags: this.config.flags,
      timestamp: this.modeInitializedAt.toISOString(),
    });

    // Create security event in database (async, don't block startup)
    this.createModeInitializationEvent().catch((err) =>
      logger.error('Failed to create mode initialization security event', { error: err })
    );
  }

  /**
   * Create security event for mode initialization
   * @private
   */
  private async createModeInitializationEvent(): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.securityEvent.create({
      data: {
        eventType: 'SECURITY_MODE_INITIALIZED',
        severity: this.config.mode === 'vulnerable' ? 'HIGH' : 'LOW',
        userId: null, // System event
        details: {
          mode: this.config.mode,
          flags: this.config.flags,
          initializedAt: this.modeInitializedAt.toISOString(),
        },
      },
    });
  }

  /**
   * Get the singleton instance of SecurityConfigService
   * Configuration is validated and logged on first access
   */
  public static getInstance(): SecurityConfigService {
    if (!SecurityConfigService.instance) {
      SecurityConfigService.instance = new SecurityConfigService();
    }
    return SecurityConfigService.instance;
  }

  /**
   * Reset the singleton instance (for testing purposes only)
   */
  public static resetInstance(): void {
    SecurityConfigService.instance = undefined as unknown as SecurityConfigService;
  }

  /**
   * Check if a specific security feature is enabled
   * @param feature - The feature flag to check
   * @returns true if the feature is enabled, false otherwise
   */
  public isFeatureEnabled(feature: FeatureFlag): boolean {
    return this.config.flags[feature];
  }

  /**
   * Get the current security mode
   * @returns 'vulnerable' or 'secure'
   */
  public getSecurityMode(): SecurityMode {
    return this.config.mode;
  }

  /**
   * Get all feature flag states (useful for debugging/logging)
   * @returns Object with all feature flag states
   */
  public getAllFlags(): FeatureFlagState {
    return { ...this.config.flags };
  }

  /**
   * Check if running in secure mode
   * @returns true if SECURITY_MODE is 'secure'
   */
  public isSecureMode(): boolean {
    return this.config.mode === 'secure';
  }

  /**
   * Check if running in vulnerable mode (for pentest demos)
   * @returns true if SECURITY_MODE is 'vulnerable'
   */
  public isVulnerableMode(): boolean {
    return this.config.mode === 'vulnerable';
  }

  /**
   * Get the timestamp when security mode was initialized
   * @returns Date object representing initialization time
   */
  public getModeInitializedAt(): Date {
    return this.modeInitializedAt;
  }

  /**
   * Get complete security status for health checks and UI display
   * @returns SecurityStatus object with mode, flags, initialization time, and uptime
   */
  public getSecurityStatus(): SecurityStatus {
    return {
      mode: this.config.mode,
      flags: { ...this.config.flags },
      initializedAt: this.modeInitializedAt.toISOString(),
      uptimeMs: Date.now() - this.modeInitializedAt.getTime(),
    };
  }
}

// Export convenience singleton instance
export const securityConfigService = SecurityConfigService.getInstance();
