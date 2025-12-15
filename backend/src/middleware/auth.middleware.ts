import '../types/express.d.ts';
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.utils';
import { getPrismaClient } from '../config/database';
import type { UserRole } from '../generated/prisma';

// Extend Express Request to include userRole
declare global {
  namespace Express {
    interface Request {
      userRole?: UserRole;
    }
  }
}

/**
 * JWT Authentication Middleware
 *
 * Validates JWT tokens from Authorization header (Bearer token)
 * Extracts userId from verified JWT and attaches to request
 * Returns 401 if token is missing, invalid, or expired
 *
 * @param req - Express request
 * @param res - Express response
 * @param next - Next middleware function
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
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

    // Attach userId to request for use in controllers
    req.userId = payload.userId;

    next();
  } catch {
    res.status(401).json({
      message: 'Unauthorized: Invalid or expired token',
      error: 'AUTH_TOKEN_INVALID',
    });
  }
}

// Alias for backward compatibility
export const authMiddleware = requireAuth;

/**
 * Role-based Access Control Middleware
 *
 * Checks if the authenticated user has one of the required roles.
 * Must be used after requireAuth middleware.
 *
 * @param allowedRoles - Array of roles that are allowed to access the route
 */
export function roleMiddleware(allowedRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.userId) {
        res.status(401).json({
          message: 'Unauthorized: Authentication required',
          error: 'AUTH_REQUIRED',
        });
        return;
      }

      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { role: true },
      });

      if (!user) {
        res.status(401).json({
          message: 'Unauthorized: User not found',
          error: 'USER_NOT_FOUND',
        });
        return;
      }

      // Attach role to request for downstream use
      req.userRole = user.role;

      if (!allowedRoles.includes(user.role)) {
        res.status(403).json({
          message: 'Forbidden: Insufficient permissions',
          error: 'INSUFFICIENT_PERMISSIONS',
        });
        return;
      }

      next();
    } catch {
      res.status(500).json({
        message: 'Internal server error',
        error: 'ROLE_CHECK_FAILED',
      });
    }
  };
}
