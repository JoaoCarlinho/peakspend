/**
 * RBAC Middleware
 *
 * Express middleware for enforcing role-based access control on tool execution.
 * Intercepts tool invocation requests and validates permissions before execution.
 *
 * Features:
 * - Permission checking for tool invocations
 * - Rate limit enforcement
 * - Security event logging for denied attempts
 * - Feature flag integration (TOOL_RBAC_ENABLED)
 *
 * Usage:
 *   import { rbacMiddleware, createToolExecutionHandler } from '@/security/rbacMiddleware';
 *
 *   // Apply to tool execution routes
 *   app.post('/api/tools/execute', rbacMiddleware(), async (req, res) => {
 *     // req.rbacResult contains authorization details
 *   });
 */

import { Request, Response, NextFunction } from 'express';
import {
  rbacEnforcer,
  UnauthorizedToolAccessError,
  RateLimitExceededError,
} from './rbacEnforcer.service';
import { getCurrentUserId, getCurrentUserRole, hasUserContext } from './userContext.service';
import { getPrismaClient } from '../config/database';
import logger from '../config/logger';
import type { AuthorizationResult } from './toolPermissions.types';

// Extend Express Request type to include RBAC result
declare global {
  namespace Express {
    interface Request {
      rbacResult?: AuthorizationResult;
    }
  }
}

/**
 * Tool execution request body
 */
export interface ToolExecutionRequest {
  toolName: string;
  parameters?: Record<string, unknown>;
}

/**
 * Error response format
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Create RBAC middleware for tool execution
 *
 * @returns Express middleware function
 */
export function rbacMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only apply to requests with toolName in body
    const body = req.body as ToolExecutionRequest | undefined;
    if (!body?.toolName) {
      next();
      return;
    }

    const { toolName, parameters } = body;

    try {
      // Check user context
      if (!hasUserContext()) {
        logger.warn('RBAC middleware: No user context', {
          event: 'RBAC_NO_USER_CONTEXT',
          toolName,
        });
        const errorResponse: ErrorResponse = {
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Authentication required for tool execution',
          },
        };
        res.status(401).json(errorResponse);
        return;
      }

      const userId = getCurrentUserId();
      const role = getCurrentUserRole();

      if (!userId || !role) {
        logger.warn('RBAC middleware: Missing user context details', {
          event: 'RBAC_MISSING_CONTEXT',
          toolName,
          hasUserId: !!userId,
          hasRole: !!role,
        });
        const errorResponse: ErrorResponse = {
          error: {
            code: 'INVALID_USER_CONTEXT',
            message: 'Invalid user context for tool execution',
          },
        };
        res.status(401).json(errorResponse);
        return;
      }

      // Check tool access permission
      const authResult = rbacEnforcer.enforceToolAccess(toolName, role);

      // Check rate limit
      const rateResult = rbacEnforcer.checkRateLimit(toolName, userId);
      if (!rateResult.allowed) {
        logger.warn('RBAC middleware: Rate limit exceeded', {
          event: 'RBAC_RATE_LIMIT_BLOCKED',
          toolName,
          userId,
        });
        const errorResponse: ErrorResponse = {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests for this tool',
            details: {
              limit: rateResult.limit,
            },
          },
        };
        res.status(429).json(errorResponse);
        return;
      }

      // Attach authorization result to request
      req.rbacResult = {
        ...authResult,
        rateLimitRemaining: rateResult.remaining,
      };

      next();
    } catch (error) {
      if (error instanceof UnauthorizedToolAccessError) {
        // Log security event
        await logUnauthorizedAttempt(error.toolName, error.role, parameters);

        const errorResponse: ErrorResponse = {
          error: {
            code: 'TOOL_ACCESS_DENIED',
            message: 'You do not have permission to use this tool',
          },
        };
        res.status(403).json(errorResponse);
        return;
      }

      if (error instanceof RateLimitExceededError) {
        const errorResponse: ErrorResponse = {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded: ${error.limit} requests per ${error.window}`,
          },
        };
        res.status(429).json(errorResponse);
        return;
      }

      // Re-throw unexpected errors
      next(error);
    }
  };
}

/**
 * Log unauthorized tool access attempt to security events
 */
async function logUnauthorizedAttempt(
  toolName: string,
  role: string,
  parameters?: Record<string, unknown>
): Promise<void> {
  const userId = getCurrentUserId();

  try {
    const prisma = getPrismaClient();
    const sanitizedParams = sanitizeParameters(parameters);
    await prisma.securityEvent.create({
      data: {
        eventType: 'UNAUTHORIZED_TOOL_INVOCATION',
        severity: 'MEDIUM',
        userId: userId || null,
        details: {
          toolName,
          role,
          parameters: JSON.parse(JSON.stringify(sanitizedParams)),
          timestamp: new Date().toISOString(),
        },
        status: 'PENDING',
        alertSent: false,
      },
    });

    logger.warn('RBAC: Unauthorized tool invocation logged', {
      event: 'RBAC_UNAUTHORIZED_LOGGED',
      toolName,
      role,
      userId,
    });
  } catch (dbError) {
    // Don't fail the request if logging fails
    logger.error('Failed to log unauthorized tool attempt', {
      event: 'RBAC_LOG_ERROR',
      error: dbError instanceof Error ? dbError.message : String(dbError),
    });
  }
}

/**
 * Sanitize parameters to remove sensitive data before logging
 */
function sanitizeParameters(params?: Record<string, unknown>): Record<string, unknown> {
  if (!params) return {};

  const sensitiveKeys = ['password', 'token', 'secret', 'ssn', 'creditcard', 'key', 'auth'];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    // Check if key contains sensitive terms
    const isSensitive = sensitiveKeys.some((sk) => key.toLowerCase().includes(sk));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 100) {
      sanitized[key] = value.substring(0, 100) + '...[truncated]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Create a tool execution handler with RBAC enforcement
 * Combines RBAC middleware with tool execution logic
 *
 * @param executeToolFn - Function to execute the tool
 * @returns Express request handler
 */
export function createToolExecutionHandler(
  executeToolFn: (
    toolName: string,
    parameters: Record<string, unknown>,
    userId: string,
    dataScope: string
  ) => Promise<unknown>
) {
  return async (req: Request, res: Response): Promise<void> => {
    const { toolName, parameters = {} } = req.body as ToolExecutionRequest;
    const userId = getCurrentUserId();

    if (!userId || !req.rbacResult) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Missing execution context',
        },
      });
      return;
    }

    try {
      const result = await executeToolFn(
        toolName,
        parameters,
        userId,
        req.rbacResult.dataScope || 'own'
      );

      res.json({
        success: true,
        result,
        metadata: {
          toolName,
          dataScope: req.rbacResult.dataScope,
          rateLimitRemaining: req.rbacResult.rateLimitRemaining,
        },
      });
    } catch (error) {
      logger.error('Tool execution failed', {
        event: 'TOOL_EXECUTION_ERROR',
        toolName,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: {
          code: 'TOOL_EXECUTION_ERROR',
          message: 'Tool execution failed',
        },
      });
    }
  };
}
