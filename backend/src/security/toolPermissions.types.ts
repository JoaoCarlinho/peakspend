/**
 * Tool Permissions Types
 *
 * Defines the schema for tool permission configuration.
 * Used for LLM Tool RBAC (Role-Based Access Control).
 */

/**
 * Valid user roles in the system
 */
export type Role = 'user' | 'admin' | 'security';

/**
 * Data scope for tool access
 * - 'own': User can only access their own data
 * - 'team': User can access team member data
 * - 'all': User can access all data (admin/security operations)
 */
export type DataScope = 'own' | 'team' | 'all';

/**
 * Parameter restriction for tool inputs
 */
export interface ToolParameterRestriction {
  /** Parameter name to restrict */
  parameterName: string;
  /** Allowed values (whitelist) */
  allowedValues?: string[];
  /** Maximum string length */
  maxLength?: number;
  /** Regex pattern for validation */
  pattern?: string;
}

/**
 * Rate limit configuration for a tool
 */
export interface ToolRateLimit {
  /** Maximum invocations per minute */
  maxPerMinute: number;
  /** Maximum invocations per hour */
  maxPerHour: number;
}

/**
 * Permission definition for a single tool
 */
export interface ToolPermission {
  /** Unique tool identifier */
  toolName: string;
  /** Human-readable description */
  description: string;
  /** Roles allowed to use this tool */
  allowedRoles: Role[];
  /** Data scope restriction */
  dataScope: DataScope;
  /** Optional parameter restrictions */
  parameters?: ToolParameterRestriction[];
  /** Optional rate limiting */
  rateLimit?: ToolRateLimit;
}

/**
 * Role hierarchy definition
 * Maps each role to the roles it inherits permissions from
 */
export type RoleHierarchy = Record<Role, Role[]>;

/**
 * Complete tool permissions configuration
 */
export interface ToolPermissionsConfig {
  /** Configuration version for migration support */
  version: string;
  /** Role inheritance hierarchy */
  roleHierarchy: RoleHierarchy;
  /** List of tool permissions */
  tools: ToolPermission[];
  /** If true, tools not in config are denied */
  defaultDeny: boolean;
}

/**
 * Result of an authorization check
 */
export interface AuthorizationResult {
  /** Whether access is allowed */
  allowed: boolean;
  /** Reason for the decision */
  reason: string;
  /** Tool that was checked */
  toolName: string;
  /** Role that was checked */
  role: string;
  /** Data scope if allowed */
  dataScope?: DataScope;
  /** Rate limit info if applicable */
  rateLimitRemaining?: number;
}
