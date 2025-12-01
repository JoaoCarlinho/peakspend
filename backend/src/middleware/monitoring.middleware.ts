import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';
import { MetricsCollector } from '../utils/metrics';

/**
 * Monitoring middleware that tracks request metrics
 */
export function monitoringMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Add request ID to request object for downstream use
  req.requestId = requestId;

  // Log incoming request
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Track response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Log response
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode,
      duration,
    });

    // Collect metrics
    const metrics: RequestMetrics = {
      method: req.method,
      path: req.path,
      statusCode,
      duration,
    };
    MetricsCollector.recordRequest(metrics);

    // Log errors (4xx and 5xx responses)
    if (statusCode >= 400) {
      logger.warn('Request failed', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode,
        duration,
      });
    }

    if (statusCode >= 500) {
      logger.error('Server error', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode,
        duration,
      });
    }
  });

  next();
}

/**
 * Error logging middleware
 */
export function errorLoggingMiddleware(
  err: Error,
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const requestId = req.requestId || 'unknown';

  logger.error('Unhandled error', {
    requestId,
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
  });

  MetricsCollector.recordError({
    type: err.name,
    message: err.message,
    path: req.path,
  });

  next(err);
}

interface RequestMetrics {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
}
