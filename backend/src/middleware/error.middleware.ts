import { Request, Response, NextFunction } from 'express';
import { Prisma } from '../generated/prisma/client';

/**
 * Global error handling middleware
 *
 * Catches all errors from routes and transforms them into appropriate HTTP responses
 * Handles Prisma errors, validation errors, and generic errors
 */

interface ErrorResponse {
  message: string;
  error?: string;
  details?: unknown;
}

/**
 * Express error handling middleware
 *
 * Must be registered after all routes in app.ts
 *
 * @param err - Error object
 * @param req - Express request
 * @param res - Express response
 * @param next - Next middleware (unused, required by Express signature)
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Error caught by global handler:', err);

  // Prisma-specific errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    handlePrismaError(err, res);
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      message: 'Database validation error',
      error: 'VALIDATION_ERROR',
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    res.status(503).json({
      message: 'Database connection failed',
      error: 'DB_CONNECTION_ERROR',
    });
    return;
  }

  // Generic error fallback
  const errorObj = err as unknown as Record<string, unknown>;
  const statusCode = errorObj['statusCode'] || 500;
  const response: ErrorResponse = {
    message: err.message || 'Internal server error',
    error: errorObj['code'] as string,
  };

  if (process.env['NODE_ENV'] === 'development') {
    response.details = err.stack;
  }

  res.status(statusCode as number).json(response);
}

/**
 * Handle Prisma-specific errors and map to HTTP responses
 *
 * @param error - Prisma error
 * @param res - Express response
 */
function handlePrismaError(error: Prisma.PrismaClientKnownRequestError, res: Response): void {
  switch (error.code) {
    case 'P2002': {
      // Unique constraint violation
      const target = (error.meta?.['target'] as string[]) || [];
      res.status(409).json({
        message: 'Unique constraint violation',
        error: 'UNIQUE_CONSTRAINT',
        details: {
          fields: target,
        },
      });
      break;
    }

    case 'P2025': {
      // Record not found
      res.status(404).json({
        message: 'Record not found',
        error: 'NOT_FOUND',
      });
      break;
    }

    case 'P2003': {
      // Foreign key constraint failed
      res.status(400).json({
        message: 'Foreign key constraint failed',
        error: 'FOREIGN_KEY_ERROR',
        details: {
          field: error.meta?.['field_name'],
        },
      });
      break;
    }

    case 'P2014': {
      // Required relation violation
      res.status(400).json({
        message: 'Required relation violation',
        error: 'RELATION_ERROR',
      });
      break;
    }

    default: {
      // Generic Prisma error
      res.status(500).json({
        message: 'Database operation failed',
        error: 'DATABASE_ERROR',
        details:
          process.env['NODE_ENV'] === 'development'
            ? { code: error.code, meta: error.meta }
            : undefined,
      });
    }
  }
}
