/**
 * Express type extensions
 *
 * Extends Express Request interface to include custom properties
 */

import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      validatedQuery?: Record<string, unknown>;
      validatedParams?: Record<string, unknown>;
      validatedBody?: unknown;
    }
  }
}

export {};
