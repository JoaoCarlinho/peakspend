/**
 * RBAC Enforcer Service
 *
 * Enforces role-based access control for LLM tool invocations.
 * Integrates with ToolPermissionsService for permission lookups
 * and provides rate limiting and data scope enforcement.
 *
 * Features:
 * - Permission checking with role hierarchy support
 * - In-memory rate limiting per user/tool
 * - Data scope filtering for queries
 * - Feature flag integration (TOOL_RBAC_ENABLED)
 * - Comprehensive logging of authorization decisions
 *
 * Usage:
 *   import { rbacEnforcer } from '@/security';
 *
 *   // Check access (returns result)
 *   const result = rbacEnforcer.checkToolAccess('getExpenses', 'user');
 *
 *   // Enforce access (throws on deny)
 *   rbacEnforcer.enforceToolAccess('getAuditLogs', 'user'); // throws UnauthorizedToolAccessError
 */

import { securityConfigService } from './securityConfig.service';
import { toolPermissionsService, Role, DataScope, ToolRateLimit } from './toolPermissions.service';
import logger from '../config/logger';
import type { AuthorizationResult } from './toolPermissions.types';
import { attemptTracker } from './unauthorizedAttemptTracker';

// Re-export AuthorizationResult for convenience
export type { AuthorizationResult };

/**
 * Error thrown when tool access is denied
 */
export class UnauthorizedToolAccessError extends Error {
  public readonly toolName: string;
  public readonly role: string;
  public readonly reason: string;

  constructor(toolName: string, role: string, reason: string) {
    super(`Unauthorized access to tool '${toolName}': ${reason}`);
    this.name = 'UnauthorizedToolAccessError';
    this.toolName = toolName;
    this.role = role;
    this.reason = reason;
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitExceededError extends Error {
  public readonly toolName: string;
  public readonly userId: string;
  public readonly limit: number;
  public readonly window: 'minute' | 'hour';

  constructor(toolName: string, userId: string, limit: number, window: 'minute' | 'hour') {
    super(`Rate limit exceeded for tool '${toolName}': ${limit} per ${window}`);
    this.name = 'RateLimitExceededError';
    this.toolName = toolName;
    this.userId = userId;
    this.limit = limit;
    this.window = window;
  }
}

/**
 * Rate limit tracking entry
 */
interface RateLimitEntry {
  minuteCount: number;
  minuteStart: number;
  hourCount: number;
  hourStart: number;
}

/**
 * RBAC Enforcer Service
 *
 * Singleton service for enforcing role-based access control on tools.
 */
export class RBACEnforcerService {
  private static instance: RBACEnforcerService | null = null;

  // In-memory rate limit tracking (per user:tool)
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  private readonly MINUTE_MS = 60 * 1000;
  private readonly HOUR_MS = 60 * 60 * 1000;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): RBACEnforcerService {
    if (!RBACEnforcerService.instance) {
      RBACEnforcerService.instance = new RBACEnforcerService();
    }
    return RBACEnforcerService.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    RBACEnforcerService.instance = null;
  }

  /**
   * Check if tool access is allowed for a role
   *
   * @param toolName - The tool to check
   * @param role - The user's role
   * @returns Authorization result with details
   */
  public checkToolAccess(toolName: string, role: string): AuthorizationResult {
    // Check if RBAC is enabled
    if (!securityConfigService.isFeatureEnabled('TOOL_RBAC_ENABLED')) {
      logger.debug('RBAC bypassed - feature disabled', {
        event: 'RBAC_BYPASSED',
        toolName,
        role,
      });
      return {
        allowed: true,
        reason: 'RBAC disabled',
        toolName,
        role,
      };
    }

    // Validate role is a valid Role type
    if (!this.isValidRole(role)) {
      logger.warn('RBAC: Invalid role provided', {
        event: 'RBAC_INVALID_ROLE',
        toolName,
        role,
      });
      return {
        allowed: false,
        reason: 'Invalid role',
        toolName,
        role,
      };
    }

    // Check permission
    const isAllowed = toolPermissionsService.isToolAllowed(toolName, role as Role);
    const permission = toolPermissionsService.getToolPermission(toolName);

    const result: AuthorizationResult = {
      allowed: isAllowed,
      reason: isAllowed ? 'Role has permission' : 'Role lacks permission',
      toolName,
      role,
      ...(permission?.dataScope && { dataScope: permission.dataScope }),
    };

    // Log the decision
    if (isAllowed) {
      logger.info('RBAC: Tool access allowed', {
        event: 'RBAC_ACCESS_ALLOWED',
        toolName,
        role,
        dataScope: permission?.dataScope,
      });
    } else {
      logger.warn('RBAC: Tool access denied', {
        event: 'RBAC_ACCESS_DENIED',
        toolName,
        role,
        allowedRoles: permission?.allowedRoles ?? [],
        configuredTool: !!permission,
      });
    }

    return result;
  }

  /**
   * Enforce tool access - throws on denial
   *
   * @param toolName - The tool to check
   * @param role - The user's role
   * @returns Authorization result if allowed
   * @throws UnauthorizedToolAccessError if denied
   */
  public enforceToolAccess(toolName: string, role: string): AuthorizationResult {
    const result = this.checkToolAccess(toolName, role);

    if (!result.allowed) {
      throw new UnauthorizedToolAccessError(toolName, role, result.reason);
    }

    return result;
  }

  /**
   * Enforce tool access with attempt tracking for unauthorized attempts
   *
   * @param toolName - The tool to check
   * @param role - The user's role
   * @param userId - User ID for tracking
   * @param sessionId - Optional session ID for tracking
   * @param parameters - Parameters passed to the tool (will be sanitized)
   * @returns Authorization result if allowed
   * @throws UnauthorizedToolAccessError if denied
   */
  public async enforceToolAccessWithTracking(
    toolName: string,
    role: string,
    userId: string,
    sessionId?: string,
    parameters: Record<string, unknown> = {}
  ): Promise<AuthorizationResult> {
    const result = this.checkToolAccess(toolName, role);

    if (!result.allowed) {
      // Get required roles for tracking
      const permission = toolPermissionsService.getToolPermission(toolName);
      const requiredRoles = permission?.allowedRoles ?? [];

      // Track the unauthorized attempt
      await attemptTracker.trackAttempt(
        userId,
        sessionId ?? null,
        toolName,
        role,
        requiredRoles,
        parameters
      );

      throw new UnauthorizedToolAccessError(toolName, role, result.reason);
    }

    return result;
  }

  /**
   * Check rate limit for a user/tool combination
   *
   * @param toolName - The tool being invoked
   * @param userId - The user invoking the tool
   * @returns Rate limit check result
   */
  public checkRateLimit(
    toolName: string,
    userId: string
  ): { allowed: boolean; remaining: number; limit?: ToolRateLimit } {
    // Check if RBAC is enabled
    if (!securityConfigService.isFeatureEnabled('TOOL_RBAC_ENABLED')) {
      return { allowed: true, remaining: Infinity };
    }

    const rateLimit = toolPermissionsService.getRateLimit(toolName);

    // No rate limit configured
    if (!rateLimit) {
      return { allowed: true, remaining: Infinity };
    }

    const key = `${userId}:${toolName}`;
    const now = Date.now();
    let entry = this.rateLimits.get(key);

    // Initialize or reset expired windows
    if (!entry) {
      entry = {
        minuteCount: 0,
        minuteStart: now,
        hourCount: 0,
        hourStart: now,
      };
      this.rateLimits.set(key, entry);
    }

    // Reset minute window if expired
    if (now - entry.minuteStart > this.MINUTE_MS) {
      entry.minuteCount = 0;
      entry.minuteStart = now;
    }

    // Reset hour window if expired
    if (now - entry.hourStart > this.HOUR_MS) {
      entry.hourCount = 0;
      entry.hourStart = now;
    }

    // Check minute limit
    if (entry.minuteCount >= rateLimit.maxPerMinute) {
      logger.warn('RBAC: Rate limit exceeded (per minute)', {
        event: 'RBAC_RATE_LIMIT_EXCEEDED',
        toolName,
        userId,
        count: entry.minuteCount,
        limit: rateLimit.maxPerMinute,
        window: 'minute',
      });
      return {
        allowed: false,
        remaining: 0,
        limit: rateLimit,
      };
    }

    // Check hour limit
    if (entry.hourCount >= rateLimit.maxPerHour) {
      logger.warn('RBAC: Rate limit exceeded (per hour)', {
        event: 'RBAC_RATE_LIMIT_EXCEEDED',
        toolName,
        userId,
        count: entry.hourCount,
        limit: rateLimit.maxPerHour,
        window: 'hour',
      });
      return {
        allowed: false,
        remaining: 0,
        limit: rateLimit,
      };
    }

    // Increment counts
    entry.minuteCount++;
    entry.hourCount++;

    const remaining = Math.min(
      rateLimit.maxPerMinute - entry.minuteCount,
      rateLimit.maxPerHour - entry.hourCount
    );

    return {
      allowed: true,
      remaining,
      limit: rateLimit,
    };
  }

  /**
   * Enforce rate limit - throws on exceeded
   *
   * @param toolName - The tool being invoked
   * @param userId - The user invoking the tool
   * @throws RateLimitExceededError if limit exceeded
   */
  public enforceRateLimit(toolName: string, userId: string): void {
    const result = this.checkRateLimit(toolName, userId);

    if (!result.allowed && result.limit) {
      // Determine which limit was exceeded
      const key = `${userId}:${toolName}`;
      const entry = this.rateLimits.get(key);
      const window =
        entry && entry.minuteCount >= result.limit.maxPerMinute ? 'minute' : 'hour';

      throw new RateLimitExceededError(
        toolName,
        userId,
        window === 'minute' ? result.limit.maxPerMinute : result.limit.maxPerHour,
        window
      );
    }
  }

  /**
   * Get data scope filter for database queries
   *
   * @param toolName - The tool being invoked
   * @param userId - The current user's ID
   * @param teamId - Optional team ID for team scope
   * @returns Filter object for database queries
   */
  public getDataScopeFilter(
    toolName: string,
    userId: string,
    teamId?: string
  ): Record<string, unknown> {
    // If RBAC is disabled, default to user's own data
    if (!securityConfigService.isFeatureEnabled('TOOL_RBAC_ENABLED')) {
      return { userId };
    }

    const dataScope = toolPermissionsService.getDataScope(toolName);

    switch (dataScope) {
      case 'own':
        return { userId };
      case 'team':
        return teamId ? { teamId } : { userId };
      case 'all':
        return {}; // No filter - access to all data
      default:
        // Unknown scope - default to most restrictive
        logger.warn('RBAC: Unknown data scope, defaulting to user scope', {
          event: 'RBAC_UNKNOWN_SCOPE',
          toolName,
          dataScope,
        });
        return { userId };
    }
  }

  /**
   * Get the data scope for a tool
   *
   * @param toolName - The tool to check
   * @returns The data scope or 'own' as default
   */
  public getDataScope(toolName: string): DataScope {
    return toolPermissionsService.getDataScope(toolName) ?? 'own';
  }

  /**
   * Check if RBAC is enabled
   *
   * @returns true if TOOL_RBAC_ENABLED feature flag is on
   */
  public isEnabled(): boolean {
    return securityConfigService.isFeatureEnabled('TOOL_RBAC_ENABLED');
  }

  /**
   * Validate that a string is a valid Role
   */
  private isValidRole(role: string): role is Role {
    return role === 'user' || role === 'admin' || role === 'security';
  }

  /**
   * Clear rate limit tracking (for testing)
   */
  public clearRateLimits(): void {
    this.rateLimits.clear();
  }

  /**
   * Cleanup expired rate limit entries (call periodically)
   */
  public cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.rateLimits.entries()) {
      // Remove if both windows have expired
      if (now - entry.minuteStart > this.MINUTE_MS && now - entry.hourStart > this.HOUR_MS) {
        this.rateLimits.delete(key);
      }
    }
  }
}

// Export singleton instance
export const rbacEnforcer = RBACEnforcerService.getInstance();
