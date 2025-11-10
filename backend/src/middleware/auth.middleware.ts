/// <reference path="../types/express.d.ts" />
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.utils';

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
