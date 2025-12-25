/**
 * Secure Tool Executor
 *
 * Centralizes all LLM tool invocations with security enforcement.
 * Ensures user binding, validates tool access, and provides audit logging.
 *
 * Key Security Features:
 * - Automatic user ID injection from server-side context
 * - Tool registry with scope requirements
 * - Output validation to detect cross-user data leaks
 * - Comprehensive audit logging for all tool executions
 *
 * Usage:
 *   const executor = SecureToolExecutor.getInstance();
 *
 *   executor.registerTool({
 *     name: 'getExpenses',
 *     requiresUserScope: true,
 *     handler: async (params) => { ... }
 *   });
 *
 *   const result = await executor.executeTool('getExpenses', { startDate: '...' });
 */

import { getCurrentUserId, getCurrentUserRole, hasUserContext, NoUserContextError } from '../../security/userContext.service';
import { securityConfigService } from '../../security/securityConfig.service';
import { rbacEnforcer, UnauthorizedToolAccessError, RateLimitExceededError } from '../../security/rbacEnforcer.service';
import { getPrismaClient } from '../../config/database';
import logger from '../../config/logger';

// Re-export RBAC errors for consumers
export { UnauthorizedToolAccessError, RateLimitExceededError };

/**
 * Error thrown when attempting to execute an unknown tool
 */
export class UnknownToolError extends Error {
  public readonly toolName: string;

  constructor(toolName: string) {
    super(`Unknown tool: ${toolName}. Tool must be registered before execution.`);
    this.name = 'UnknownToolError';
    this.toolName = toolName;
  }
}

/**
 * Error thrown when cross-user access is detected
 */
export class CrossUserAccessError extends Error {
  public readonly statusCode: number = 403;

  constructor(message: string = 'Cross-user access detected and blocked') {
    super(message);
    this.name = 'CrossUserAccessError';
  }
}

/**
 * Error thrown when a tool execution fails
 */
export class ToolExecutionError extends Error {
  public readonly toolName: string;
  public readonly cause: Error | undefined;

  constructor(toolName: string, message: string, cause?: Error) {
    super(`Tool '${toolName}' execution failed: ${message}`);
    this.name = 'ToolExecutionError';
    this.toolName = toolName;
    this.cause = cause;
  }
}

/**
 * Tool definition interface
 */
export interface ToolDefinition<TParams = Record<string, unknown>, TResult = unknown> {
  /** Unique tool name */
  name: string;
  /** Description of what the tool does */
  description?: string;
  /** Whether the tool requires user scope (userId injection) */
  requiresUserScope: boolean;
  /** The handler function that executes the tool */
  handler: (params: TParams & { userId?: string }) => Promise<TResult>;
  /** Optional validator to check output doesn't contain cross-user data */
  validateOutput?: (output: TResult, userId: string) => boolean;
}

/**
 * Tool execution result with metadata
 */
export interface ToolExecutionResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: Error;
  duration: number;
  toolName: string;
  userId?: string;
}

/**
 * Secure Tool Executor
 *
 * Singleton service that wraps all LLM tool invocations with security controls.
 */
export class SecureToolExecutor {
  private static instance: SecureToolExecutor | null = null;
  private tools: Map<string, ToolDefinition> = new Map();

  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static getInstance(): SecureToolExecutor {
    if (!SecureToolExecutor.instance) {
      SecureToolExecutor.instance = new SecureToolExecutor();
    }
    return SecureToolExecutor.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    SecureToolExecutor.instance = null;
  }

  /**
   * Register a tool with the executor
   *
   * @param tool - The tool definition to register
   */
  public registerTool<TParams, TResult>(tool: ToolDefinition<TParams, TResult>): void {
    if (this.tools.has(tool.name)) {
      logger.warn('Tool already registered, overwriting', {
        event: 'TOOL_REGISTRATION_OVERWRITE',
        toolName: tool.name,
      });
    }

    this.tools.set(tool.name, tool as ToolDefinition);

    logger.debug('Tool registered', {
      event: 'TOOL_REGISTERED',
      toolName: tool.name,
      requiresUserScope: tool.requiresUserScope,
    });
  }

  /**
   * Unregister a tool
   *
   * @param toolName - The name of the tool to unregister
   */
  public unregisterTool(toolName: string): boolean {
    const deleted = this.tools.delete(toolName);
    if (deleted) {
      logger.debug('Tool unregistered', {
        event: 'TOOL_UNREGISTERED',
        toolName,
      });
    }
    return deleted;
  }

  /**
   * Check if a tool is registered
   *
   * @param toolName - The name of the tool to check
   */
  public hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * Get list of registered tool names
   */
  public getRegisteredTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Execute a tool with security enforcement
   *
   * @param toolName - The name of the tool to execute
   * @param params - The parameters to pass to the tool
   * @returns The tool execution result
   * @throws UnknownToolError if tool is not registered
   * @throws NoUserContextError if user context required but not available
   * @throws CrossUserAccessError if cross-user data detected in output
   */
  public async executeTool<TResult = unknown>(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<TResult> {
    const startTime = Date.now();
    const userId = getCurrentUserId();
    const userRole = getCurrentUserRole();
    const isSecureMode = securityConfigService.isFeatureEnabled('TENANT_ISOLATION_ENABLED');

    // Validate tool exists
    const tool = this.tools.get(toolName);
    if (!tool) {
      logger.error('Unknown tool execution attempted', {
        event: 'UNKNOWN_TOOL_ATTEMPT',
        toolName,
        userId,
      });
      throw new UnknownToolError(toolName);
    }

    // Validate user context for scoped tools
    if (tool.requiresUserScope) {
      if (isSecureMode && !hasUserContext()) {
        logger.error('Tool execution without user context in secure mode', {
          event: 'TOOL_NO_USER_CONTEXT',
          toolName,
        });
        throw new NoUserContextError(`Tool execution: ${toolName}`);
      }

      if (!hasUserContext()) {
        logger.warn('Tool execution without user context (insecure mode)', {
          event: 'TOOL_INSECURE_EXECUTION',
          toolName,
        });
      }
    }

    // RBAC check - enforce tool access based on user's role
    if (userRole) {
      // This will throw UnauthorizedToolAccessError if denied
      rbacEnforcer.enforceToolAccess(toolName, userRole);

      // Check rate limit - this will throw RateLimitExceededError if exceeded
      if (userId) {
        rbacEnforcer.enforceRateLimit(toolName, userId);
      }
    }

    // Log execution start
    logger.debug('Tool execution started', {
      event: 'TOOL_EXECUTION_START',
      toolName,
      userId,
      requiresUserScope: tool.requiresUserScope,
      paramKeys: Object.keys(params),
    });

    try {
      // Inject userId for scoped tools
      const enhancedParams = tool.requiresUserScope && userId
        ? { ...params, userId }
        : params;

      // Check if LLM tried to provide userId (potential manipulation)
      if (params['userId'] && params['userId'] !== userId) {
        await this.logManipulationAttempt(toolName, params['userId'] as string, userId);
      }

      // Execute tool
      const result = await tool.handler(enhancedParams);

      // Validate output if validator provided
      if (tool.validateOutput && userId) {
        const isValid = tool.validateOutput(result, userId);
        if (!isValid) {
          await this.handleCrossUserViolation(toolName, userId);
          throw new CrossUserAccessError();
        }
      }

      const duration = Date.now() - startTime;

      // Log successful execution
      logger.debug('Tool execution completed', {
        event: 'TOOL_EXECUTION_COMPLETE',
        toolName,
        userId,
        duration,
        success: true,
      });

      return result as TResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log failed execution
      logger.error('Tool execution failed', {
        event: 'TOOL_EXECUTION_FAILED',
        toolName,
        userId,
        duration,
        error: errorMessage,
      });

      // Re-throw known errors
      if (error instanceof CrossUserAccessError || error instanceof UnknownToolError) {
        throw error;
      }

      throw new ToolExecutionError(toolName, errorMessage, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Log a potential LLM manipulation attempt
   */
  private async logManipulationAttempt(
    toolName: string,
    attemptedUserId: string,
    actualUserId: string | undefined
  ): Promise<void> {
    logger.warn('LLM attempted to provide userId parameter', {
      event: 'LLM_USER_MANIPULATION_ATTEMPT',
      toolName,
      attemptedUserId,
      actualUserId,
      blocked: true,
    });

    // Create security event in database if available
    try {
      const prisma = getPrismaClient();
      await prisma.securityEvent.create({
        data: {
          eventType: 'LLM_USER_MANIPULATION_ATTEMPT',
          severity: 'high',
          userId: actualUserId || 'unknown',
          details: {
            toolName,
            attemptedUserId,
            actualUserId: actualUserId || 'unknown',
            blocked: true,
          },
        },
      });
    } catch (dbError) {
      // Don't fail the operation if logging fails
      logger.error('Failed to create security event', {
        error: dbError instanceof Error ? dbError.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle cross-user access violation
   */
  private async handleCrossUserViolation(
    toolName: string,
    userId: string
  ): Promise<void> {
    logger.error('Cross-user access detected in tool output', {
      event: 'CROSS_USER_ACCESS_ATTEMPT',
      toolName,
      userId,
      severity: 'critical',
    });

    // Create security event in database
    try {
      const prisma = getPrismaClient();
      await prisma.securityEvent.create({
        data: {
          eventType: 'CROSS_USER_ACCESS_ATTEMPT',
          severity: 'critical',
          userId,
          details: {
            toolName,
            blocked: true,
          },
        },
      });
    } catch (dbError) {
      // Don't fail the operation if logging fails
      logger.error('Failed to create security event', {
        error: dbError instanceof Error ? dbError.message : 'Unknown error',
      });
    }
  }
}

// Export singleton instance
export const secureToolExecutor = SecureToolExecutor.getInstance();
