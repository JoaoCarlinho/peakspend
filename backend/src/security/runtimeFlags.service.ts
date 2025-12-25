/**
 * RuntimeFlagsService - Dynamic feature flag management
 *
 * Enables runtime toggling of security features without application restart.
 * Overrides stored in memory and applied on top of base configuration.
 * All changes are logged to the audit system.
 */

import { securityConfigService } from './securityConfig.service';
import { FeatureFlag, FeatureFlagState } from '../config/security.config';
import { getPrismaClient } from '../config/database';
import logger from '../config/logger';

/**
 * Flag override with metadata
 */
interface FlagOverride {
  value: boolean;
  changedAt: Date;
  changedBy: string;
}

/**
 * Flag data with metadata for API responses
 */
export interface FlagWithMetadata {
  flag: FeatureFlag;
  effectiveValue: boolean;
  modeDefault: boolean;
  isOverridden: boolean;
  overriddenAt?: string;
  overriddenBy?: string;
}

/**
 * RuntimeFlagsService class
 * Manages runtime overrides for security feature flags
 */
export class RuntimeFlagsService {
  private static instance: RuntimeFlagsService;
  private overrides: Map<FeatureFlag, FlagOverride> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): RuntimeFlagsService {
    if (!RuntimeFlagsService.instance) {
      RuntimeFlagsService.instance = new RuntimeFlagsService();
    }
    return RuntimeFlagsService.instance;
  }

  /**
   * Reset instance for testing
   */
  public static resetInstance(): void {
    RuntimeFlagsService.instance = undefined as unknown as RuntimeFlagsService;
  }

  /**
   * Set a runtime flag override
   * @param flag - Feature flag to override
   * @param value - New value
   * @param userId - User making the change
   */
  async setFlag(flag: FeatureFlag, value: boolean, userId: string): Promise<void> {
    const previousValue = this.getEffectiveFlag(flag);
    const modeDefault = this.getModeDefault(flag);

    this.overrides.set(flag, {
      value,
      changedAt: new Date(),
      changedBy: userId,
    });

    // Log to security event
    try {
      const prisma = getPrismaClient();
      await prisma.securityEvent.create({
        data: {
          eventType: 'SECURITY_FLAG_CHANGED',
          severity: value ? 'LOW' : 'MEDIUM', // Disabling is higher severity
          userId,
          details: {
            flag,
            previousValue,
            newValue: value,
            modeDefault,
          },
        },
      });
    } catch (err) {
      logger.error('Failed to create flag change security event', { error: err });
    }

    logger.info('Security flag changed', {
      event: 'SECURITY_FLAG_CHANGED',
      flag,
      previousValue,
      newValue: value,
      modeDefault,
      changedBy: userId,
    });
  }

  /**
   * Get effective value for a single flag (with overrides applied)
   */
  getEffectiveFlag(flag: FeatureFlag): boolean {
    const override = this.overrides.get(flag);
    if (override) {
      return override.value;
    }
    return securityConfigService.isFeatureEnabled(flag);
  }

  /**
   * Get all effective flags (with overrides applied)
   */
  getEffectiveFlags(): FeatureFlagState {
    const base = securityConfigService.getAllFlags();

    for (const [flag, override] of this.overrides.entries()) {
      base[flag] = override.value;
    }

    return base;
  }

  /**
   * Get mode default for a flag (without overrides)
   */
  getModeDefault(flag: FeatureFlag): boolean {
    return securityConfigService.isFeatureEnabled(flag);
  }

  /**
   * Get all flags with metadata
   */
  getFlagsWithMetadata(): FlagWithMetadata[] {
    const flags = securityConfigService.getAllFlags();

    return (Object.keys(flags) as FeatureFlag[]).map((flag) => {
      const modeDefault = flags[flag];
      const override = this.overrides.get(flag);

      return {
        flag,
        effectiveValue: override?.value ?? modeDefault,
        modeDefault,
        isOverridden: override !== undefined,
        overriddenAt: override?.changedAt.toISOString(),
        overriddenBy: override?.changedBy,
      };
    });
  }

  /**
   * Check if a flag is currently overridden
   */
  isOverridden(flag: FeatureFlag): boolean {
    return this.overrides.has(flag);
  }

  /**
   * Reset a flag to mode default
   */
  async resetFlag(flag: FeatureFlag, userId: string): Promise<void> {
    const override = this.overrides.get(flag);
    if (!override) return;

    const previousValue = override.value;
    const resetToDefault = this.getModeDefault(flag);
    this.overrides.delete(flag);

    try {
      const prisma = getPrismaClient();
      await prisma.securityEvent.create({
        data: {
          eventType: 'SECURITY_FLAG_RESET',
          severity: 'LOW',
          userId,
          details: {
            flag,
            previousValue,
            resetToDefault,
          },
        },
      });
    } catch (err) {
      logger.error('Failed to create flag reset security event', { error: err });
    }

    logger.info('Security flag reset to default', {
      event: 'SECURITY_FLAG_RESET',
      flag,
      previousValue,
      resetToDefault,
      userId,
    });
  }

  /**
   * Reset all flags to mode defaults
   */
  async resetAllFlags(userId: string): Promise<void> {
    const overriddenFlags = Array.from(this.overrides.keys());

    if (overriddenFlags.length === 0) {
      return;
    }

    this.overrides.clear();

    try {
      const prisma = getPrismaClient();
      await prisma.securityEvent.create({
        data: {
          eventType: 'SECURITY_FLAGS_RESET_ALL',
          severity: 'LOW',
          userId,
          details: {
            flagsReset: overriddenFlags,
          },
        },
      });
    } catch (err) {
      logger.error('Failed to create reset all flags security event', { error: err });
    }

    logger.info('All security flags reset to defaults', {
      event: 'SECURITY_FLAGS_RESET_ALL',
      flagsReset: overriddenFlags,
      userId,
    });
  }

  /**
   * Get count of active overrides
   */
  getOverrideCount(): number {
    return this.overrides.size;
  }
}

// Export singleton instance
export const runtimeFlagsService = RuntimeFlagsService.getInstance();
