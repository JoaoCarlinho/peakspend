/**
 * Tool Permissions Service
 *
 * Loads, validates, and provides access to tool permission configuration.
 * Implements YAML-based declarative permission management with:
 * - Schema validation at startup (fail fast)
 * - Role hierarchy support
 * - In-memory caching for fast lookups
 * - Environment-configurable config path
 *
 * Usage:
 *   import { toolPermissionsService } from '@/security';
 *
 *   // Check if a tool is allowed for a role
 *   const allowed = toolPermissionsService.isToolAllowed('getExpenses', 'user');
 *
 *   // Get all tools available for a role
 *   const tools = toolPermissionsService.getToolsForRole('admin');
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';
import logger from '../config/logger';
import type {
  Role,
  DataScope,
  ToolPermission,
  ToolPermissionsConfig,
  ToolRateLimit,
  ToolParameterRestriction,
} from './toolPermissions.types';

// Re-export types for convenience
export type {
  Role,
  DataScope,
  ToolPermission,
  ToolPermissionsConfig,
  ToolRateLimit,
  ToolParameterRestriction,
};

/**
 * Zod schemas for configuration validation
 */
const RoleSchema = z.enum(['user', 'admin', 'security']);
const DataScopeSchema = z.enum(['own', 'team', 'all']);

const ToolParameterRestrictionSchema = z.object({
  parameterName: z.string().min(1, 'Parameter name cannot be empty'),
  allowedValues: z.array(z.string()).optional(),
  maxLength: z.number().positive().optional(),
  pattern: z.string().optional(),
});

const ToolRateLimitSchema = z.object({
  maxPerMinute: z.number().positive(),
  maxPerHour: z.number().positive(),
});

const ToolPermissionSchema = z.object({
  toolName: z.string().min(1, 'Tool name cannot be empty'),
  description: z.string().min(1, 'Description cannot be empty'),
  allowedRoles: z.array(RoleSchema).min(1, 'At least one role must be allowed'),
  dataScope: DataScopeSchema,
  parameters: z.array(ToolParameterRestrictionSchema).optional(),
  rateLimit: ToolRateLimitSchema.optional(),
});

const ToolPermissionsConfigSchema = z.object({
  version: z.string().min(1, 'Version is required'),
  roleHierarchy: z.record(RoleSchema, z.array(RoleSchema)),
  tools: z.array(ToolPermissionSchema),
  defaultDeny: z.boolean(),
});

/**
 * Error thrown when tool permissions configuration is invalid
 */
export class ToolPermissionsConfigError extends Error {
  public readonly configPath: string;
  public readonly details: string[];

  constructor(message: string, configPath: string, details: string[] = []) {
    super(message);
    this.name = 'ToolPermissionsConfigError';
    this.configPath = configPath;
    this.details = details;
  }
}

/**
 * Tool Permissions Service
 *
 * Singleton service for managing tool permissions.
 * Configuration is loaded and validated at instantiation.
 */
export class ToolPermissionsService {
  private static instance: ToolPermissionsService | null = null;
  private config: ToolPermissionsConfig | null = null;
  private toolMap: Map<string, ToolPermission> = new Map();
  private configPath: string;

  /**
   * Private constructor - use getInstance() for singleton access
   */
  private constructor() {
    this.configPath =
      process.env['TOOL_PERMISSIONS_CONFIG'] ||
      path.join(process.cwd(), 'config', 'tool-permissions.yaml');
    this.loadConfig();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ToolPermissionsService {
    if (!ToolPermissionsService.instance) {
      ToolPermissionsService.instance = new ToolPermissionsService();
    }
    return ToolPermissionsService.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    ToolPermissionsService.instance = null;
  }

  /**
   * Load and validate configuration from YAML file
   */
  private loadConfig(): void {
    // Check if file exists
    if (!fs.existsSync(this.configPath)) {
      throw new ToolPermissionsConfigError(
        `Tool permissions config not found: ${this.configPath}`,
        this.configPath
      );
    }

    try {
      // Read and parse YAML
      const fileContent = fs.readFileSync(this.configPath, 'utf-8');
      const rawConfig = yaml.load(fileContent);

      // Validate against schema
      const validationResult = ToolPermissionsConfigSchema.safeParse(rawConfig);

      if (!validationResult.success) {
        const errors = validationResult.error.issues.map(
          (e: z.ZodIssue) => `  - ${e.path.join('.')}: ${e.message}`
        );
        throw new ToolPermissionsConfigError(
          `Invalid tool permissions config`,
          this.configPath,
          errors
        );
      }

      this.config = validationResult.data as ToolPermissionsConfig;

      // Build lookup map for fast access
      this.toolMap.clear();
      for (const tool of this.config.tools) {
        if (this.toolMap.has(tool.toolName)) {
          logger.warn('Duplicate tool name in permissions config', {
            event: 'TOOL_PERMISSIONS_DUPLICATE',
            toolName: tool.toolName,
          });
        }
        this.toolMap.set(tool.toolName, tool);
      }

      // Log successful load
      logger.info('Tool permissions loaded', {
        event: 'TOOL_PERMISSIONS_LOADED',
        version: this.config.version,
        toolCount: this.config.tools.length,
        defaultDeny: this.config.defaultDeny,
        configPath: this.configPath,
      });
    } catch (error) {
      if (error instanceof ToolPermissionsConfigError) {
        logger.error('Tool permissions config validation failed', {
          event: 'TOOL_PERMISSIONS_INVALID',
          configPath: this.configPath,
          details: error.details,
        });
        throw error;
      }

      if (error instanceof Error && error.name === 'YAMLException') {
        throw new ToolPermissionsConfigError(
          `YAML parse error: ${error.message}`,
          this.configPath,
          [error.message]
        );
      }

      throw error;
    }
  }

  /**
   * Get permission definition for a tool
   *
   * @param toolName - The tool to look up
   * @returns The tool permission or null if not found
   */
  public getToolPermission(toolName: string): ToolPermission | null {
    return this.toolMap.get(toolName) ?? null;
  }

  /**
   * Check if a role is allowed to use a tool
   * Considers role hierarchy for inheritance
   *
   * @param toolName - The tool to check
   * @param role - The role to check
   * @returns true if the role can use the tool
   */
  public isToolAllowed(toolName: string, role: Role): boolean {
    const permission = this.getToolPermission(toolName);

    // Tool not in config
    if (!permission) {
      // Use defaultDeny setting
      const denied = this.config?.defaultDeny ?? true;
      if (denied) {
        logger.debug('Tool access denied - not in config', {
          event: 'TOOL_ACCESS_DENIED_NOT_CONFIGURED',
          toolName,
          role,
        });
      }
      return !denied;
    }

    // Direct role match
    if (permission.allowedRoles.includes(role)) {
      return true;
    }

    // Check inherited roles
    const inheritedRoles = this.config?.roleHierarchy[role] ?? [];
    for (const inheritedRole of inheritedRoles) {
      if (permission.allowedRoles.includes(inheritedRole)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all tools accessible by a role
   * Considers role hierarchy for inheritance
   *
   * @param role - The role to get tools for
   * @returns Array of tool permissions the role can access
   */
  public getToolsForRole(role: Role): ToolPermission[] {
    if (!this.config) return [];

    return this.config.tools.filter((tool) => this.isToolAllowed(tool.toolName, role));
  }

  /**
   * Get all configured tools
   *
   * @returns Array of all tool permissions
   */
  public getAllTools(): ToolPermission[] {
    return this.config?.tools ?? [];
  }

  /**
   * Get the data scope for a tool
   *
   * @param toolName - The tool to get scope for
   * @returns The data scope or null if tool not found
   */
  public getDataScope(toolName: string): DataScope | null {
    const permission = this.getToolPermission(toolName);
    return permission?.dataScope ?? null;
  }

  /**
   * Get rate limit configuration for a tool
   *
   * @param toolName - The tool to get rate limit for
   * @returns The rate limit config or null if not configured
   */
  public getRateLimit(toolName: string): ToolRateLimit | null {
    const permission = this.getToolPermission(toolName);
    return permission?.rateLimit ?? null;
  }

  /**
   * Get parameter restrictions for a tool
   *
   * @param toolName - The tool to get restrictions for
   * @returns Array of parameter restrictions or empty array
   */
  public getParameterRestrictions(toolName: string): ToolParameterRestriction[] {
    const permission = this.getToolPermission(toolName);
    return permission?.parameters ?? [];
  }

  /**
   * Get the full configuration (for debugging/admin)
   *
   * @returns The complete configuration object
   */
  public getConfig(): ToolPermissionsConfig | null {
    return this.config;
  }

  /**
   * Get the configuration version
   *
   * @returns The config version string
   */
  public getVersion(): string | null {
    return this.config?.version ?? null;
  }

  /**
   * Check if default deny is enabled
   *
   * @returns true if unconfigured tools are denied
   */
  public isDefaultDeny(): boolean {
    return this.config?.defaultDeny ?? true;
  }

  /**
   * Reload configuration from file
   * Useful for hot-reloading in development
   */
  public reloadConfig(): void {
    logger.info('Reloading tool permissions config', {
      event: 'TOOL_PERMISSIONS_RELOAD',
      configPath: this.configPath,
    });
    this.loadConfig();
  }
}

// Export singleton instance
export const toolPermissionsService = ToolPermissionsService.getInstance();
