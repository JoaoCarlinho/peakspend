/**
 * User Context Middleware
 *
 * Express middleware that extracts user identity from authenticated requests
 * and makes it available throughout the request lifecycle via AsyncLocalStorage.
 *
 * This app uses req.userId set by auth.middleware.ts, not req.user.
 *
 * Usage options:
 *   1. Use requireAuthWithContext in place of requireAuth on routes
 *   2. Or chain: requireAuth, userContextMiddleware
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runWithUserContext, UserContext } from './userContext.service';
import { UserRole } from '../generated/prisma';
import { verifyToken } from '../utils/jwt.utils';
import { getPrismaClient } from '../config/database';
import logger from '../config/logger';

/**
 * Express middleware that injects user context for tenant isolation
 *
 * Extracts user information from the authenticated request (req.userId set by auth middleware)
 * and runs the rest of the request handling chain within an AsyncLocalStorage context.
 *
 * Should be used AFTER requireAuth middleware.
 *
 * @param req - Express request object (with userId from auth middleware)
 * @param res - Express response object
 * @param next - Express next function
 */
export function userContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Extract userId from auth middleware (set by auth.middleware.ts)
  const userId = req.userId;

  if (!userId) {
    // No authenticated user - continue without context
    // This is fine for public routes; protected routes will fail at auth level
    logger.debug('No authenticated user, skipping user context injection', {
      path: req.path,
      method: req.method,
    });
    next();
    return;
  }

  // Generate or extract request/session IDs for tracing
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  const sessionId = (req.headers['x-session-id'] as string) || uuidv4();

  // Build the user context (role defaults to 'user', could be enhanced to fetch from DB)
  const context: UserContext = {
    userId,
    role: 'user', // Default role - could be enhanced to look up from User table
    sessionId,
    requestId,
    bypassTenantIsolation: false, // Never bypass by default
  };

  // Add request ID to response headers for tracing
  res.setHeader('x-request-id', requestId);

  logger.debug('User context injected', {
    userId: context.userId,
    role: context.role,
    requestId: context.requestId,
    path: req.path,
  });

  // Run the rest of the request handling chain within the context
  runWithUserContext(context, () => {
    next();
  });
}

/**
 * Combined authentication and context injection middleware
 *
 * This middleware combines JWT authentication with user context injection,
 * allowing it to replace requireAuth on protected routes while also setting
 * up the user context for tenant isolation.
 *
 * Also looks up user role from database to provide accurate role in context.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export async function requireAuthWithContext(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        message: 'Unauthorized: No token provided',
        error: 'AUTH_TOKEN_REQUIRED',
      });
      return;
    }

    // Extract token (remove 'Bearer ' prefix)
    const token = authHeader.substring(7);

    // Verify token and extract payload
    const payload = verifyToken(token);
    const userId = payload.userId;

    // Set userId on request for backward compatibility
    req.userId = userId;

    // Look up user role from database
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const role: UserRole = user?.role ?? 'user';

    // Generate request/session IDs for tracing
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    const sessionId = (req.headers['x-session-id'] as string) || uuidv4();

    // Build user context
    const context: UserContext = {
      userId,
      role,
      sessionId,
      requestId,
      bypassTenantIsolation: false,
    };

    // Add request ID to response headers
    res.setHeader('x-request-id', requestId);

    logger.debug('Auth verified and context injected', {
      userId: context.userId,
      role: context.role,
      requestId: context.requestId,
      path: req.path,
    });

    // Run the rest of the request within the context
    runWithUserContext(context, () => {
      next();
    });
  } catch {
    res.status(401).json({
      message: 'Unauthorized: Invalid or expired token',
      error: 'AUTH_TOKEN_INVALID',
    });
  }
}

/**
 * Middleware factory that creates a user context middleware with custom options
 *
 * @param options - Configuration options
 * @returns Express middleware function
 */
export function createUserContextMiddleware(options?: {
  /** Whether to allow requests without user context (default: true) */
  allowAnonymous?: boolean;
}): (req: Request, res: Response, next: NextFunction) => void {
  const { allowAnonymous = true } = options || {};

  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = req.userId;

    if (!userId) {
      if (!allowAnonymous) {
        logger.warn('User context required but not available', {
          path: req.path,
          method: req.method,
        });
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      next();
      return;
    }

    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    const sessionId = (req.headers['x-session-id'] as string) || uuidv4();

    const context: UserContext = {
      userId,
      role: 'user', // Default role
      sessionId,
      requestId,
      bypassTenantIsolation: false,
    };

    res.setHeader('x-request-id', requestId);

    runWithUserContext(context, () => {
      next();
    });
  };
}
