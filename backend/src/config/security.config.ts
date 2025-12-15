import { z } from 'zod';
import logger from './logger';

// Security mode enum
export type SecurityMode = 'vulnerable' | 'secure';

// Feature flag names
export type FeatureFlag =
  | 'INPUT_INSPECTION_ENABLED'
  | 'OUTPUT_INSPECTION_ENABLED'
  | 'AUDIT_LOGGING_ENABLED'
  | 'PROMPT_PROTECTION_ENABLED'
  | 'TENANT_ISOLATION_ENABLED'
  | 'ANOMALY_DETECTION_ENABLED'
  | 'TOOL_RBAC_ENABLED'
  | 'TIER2_INSPECTION_ENABLED';

// Feature flag state interface
export interface FeatureFlagState {
  INPUT_INSPECTION_ENABLED: boolean;
  OUTPUT_INSPECTION_ENABLED: boolean;
  AUDIT_LOGGING_ENABLED: boolean;
  PROMPT_PROTECTION_ENABLED: boolean;
  TENANT_ISOLATION_ENABLED: boolean;
  ANOMALY_DETECTION_ENABLED: boolean;
  TOOL_RBAC_ENABLED: boolean;
  TIER2_INSPECTION_ENABLED: boolean;
}

// Resolved security configuration
export interface SecurityConfig {
  mode: SecurityMode;
  flags: FeatureFlagState;
}

// Zod schema for security mode validation
const SecurityModeSchema = z.enum(['vulnerable', 'secure']);

// Zod schema for environment variables
const SecurityEnvSchema = z.object({
  SECURITY_MODE: SecurityModeSchema.default('secure'),
  INPUT_INSPECTION_ENABLED: z.coerce.boolean().optional(),
  OUTPUT_INSPECTION_ENABLED: z.coerce.boolean().optional(),
  AUDIT_LOGGING_ENABLED: z.coerce.boolean().optional(),
  PROMPT_PROTECTION_ENABLED: z.coerce.boolean().optional(),
  TENANT_ISOLATION_ENABLED: z.coerce.boolean().optional(),
  ANOMALY_DETECTION_ENABLED: z.coerce.boolean().optional(),
  TOOL_RBAC_ENABLED: z.coerce.boolean().optional(),
  TIER2_INSPECTION_ENABLED: z.coerce.boolean().optional(),
});

/**
 * Get default feature flags based on security mode
 * - secure mode: all features enabled (except TIER2 which is always opt-in)
 * - vulnerable mode: all features disabled (for penetration testing demos)
 */
function getDefaultFlags(mode: SecurityMode): FeatureFlagState {
  const enabled = mode === 'secure';
  return {
    INPUT_INSPECTION_ENABLED: enabled,
    OUTPUT_INSPECTION_ENABLED: enabled,
    AUDIT_LOGGING_ENABLED: enabled,
    PROMPT_PROTECTION_ENABLED: enabled,
    TENANT_ISOLATION_ENABLED: enabled,
    ANOMALY_DETECTION_ENABLED: enabled,
    TOOL_RBAC_ENABLED: enabled,
    TIER2_INSPECTION_ENABLED: false, // Always off by default (optional advanced feature)
  };
}

/**
 * Resolve feature flags by applying environment overrides to defaults
 */
function resolveFlags(
  mode: SecurityMode,
  envOverrides: Partial<FeatureFlagState>
): FeatureFlagState {
  const defaults = getDefaultFlags(mode);
  return {
    INPUT_INSPECTION_ENABLED:
      envOverrides.INPUT_INSPECTION_ENABLED ?? defaults.INPUT_INSPECTION_ENABLED,
    OUTPUT_INSPECTION_ENABLED:
      envOverrides.OUTPUT_INSPECTION_ENABLED ?? defaults.OUTPUT_INSPECTION_ENABLED,
    AUDIT_LOGGING_ENABLED:
      envOverrides.AUDIT_LOGGING_ENABLED ?? defaults.AUDIT_LOGGING_ENABLED,
    PROMPT_PROTECTION_ENABLED:
      envOverrides.PROMPT_PROTECTION_ENABLED ?? defaults.PROMPT_PROTECTION_ENABLED,
    TENANT_ISOLATION_ENABLED:
      envOverrides.TENANT_ISOLATION_ENABLED ?? defaults.TENANT_ISOLATION_ENABLED,
    ANOMALY_DETECTION_ENABLED:
      envOverrides.ANOMALY_DETECTION_ENABLED ?? defaults.ANOMALY_DETECTION_ENABLED,
    TOOL_RBAC_ENABLED:
      envOverrides.TOOL_RBAC_ENABLED ?? defaults.TOOL_RBAC_ENABLED,
    TIER2_INSPECTION_ENABLED:
      envOverrides.TIER2_INSPECTION_ENABLED ?? defaults.TIER2_INSPECTION_ENABLED,
  };
}

/**
 * Load and validate security configuration from environment variables
 * Throws on invalid configuration (fail fast principle)
 */
export function loadSecurityConfig(): SecurityConfig {
  const parseResult = SecurityEnvSchema.safeParse(process.env);

  if (!parseResult.success) {
    const errorMessages = parseResult.error.issues
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    throw new Error(`Invalid security configuration: ${errorMessages}`);
  }

  const env = parseResult.data;
  const mode = env.SECURITY_MODE;

  // Extract individual flag overrides (only defined values)
  const overrides: Partial<FeatureFlagState> = {};
  if (env.INPUT_INSPECTION_ENABLED !== undefined) {
    overrides.INPUT_INSPECTION_ENABLED = env.INPUT_INSPECTION_ENABLED;
  }
  if (env.OUTPUT_INSPECTION_ENABLED !== undefined) {
    overrides.OUTPUT_INSPECTION_ENABLED = env.OUTPUT_INSPECTION_ENABLED;
  }
  if (env.AUDIT_LOGGING_ENABLED !== undefined) {
    overrides.AUDIT_LOGGING_ENABLED = env.AUDIT_LOGGING_ENABLED;
  }
  if (env.PROMPT_PROTECTION_ENABLED !== undefined) {
    overrides.PROMPT_PROTECTION_ENABLED = env.PROMPT_PROTECTION_ENABLED;
  }
  if (env.TENANT_ISOLATION_ENABLED !== undefined) {
    overrides.TENANT_ISOLATION_ENABLED = env.TENANT_ISOLATION_ENABLED;
  }
  if (env.ANOMALY_DETECTION_ENABLED !== undefined) {
    overrides.ANOMALY_DETECTION_ENABLED = env.ANOMALY_DETECTION_ENABLED;
  }
  if (env.TOOL_RBAC_ENABLED !== undefined) {
    overrides.TOOL_RBAC_ENABLED = env.TOOL_RBAC_ENABLED;
  }
  if (env.TIER2_INSPECTION_ENABLED !== undefined) {
    overrides.TIER2_INSPECTION_ENABLED = env.TIER2_INSPECTION_ENABLED;
  }

  const flags = resolveFlags(mode, overrides);

  return { mode, flags };
}

/**
 * Log security configuration at startup
 */
export function logSecurityConfig(config: SecurityConfig): void {
  const enabledFlags = Object.entries(config.flags)
    .filter(([, value]) => value)
    .map(([key]) => key);

  const disabledFlags = Object.entries(config.flags)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  logger.info(`Security mode: ${config.mode}`, {
    securityMode: config.mode,
    enabledFlags,
    disabledFlags,
  });

  if (config.mode === 'vulnerable') {
    logger.warn(
      'SECURITY WARNING: Running in vulnerable mode. All security features disabled. DO NOT USE IN PRODUCTION.'
    );
  }
}

// Load and export singleton configuration
let _securityConfig: SecurityConfig | null = null;

/**
 * Get the security configuration singleton
 * Loads and validates on first access
 */
export function getSecurityConfig(): SecurityConfig {
  if (!_securityConfig) {
    _securityConfig = loadSecurityConfig();
    logSecurityConfig(_securityConfig);
  }
  return _securityConfig;
}

/**
 * Reset the security configuration singleton (for testing)
 */
export function resetSecurityConfig(): void {
  _securityConfig = null;
}

// Export for direct import convenience
export const securityConfig = {
  get: getSecurityConfig,
  reset: resetSecurityConfig,
};
