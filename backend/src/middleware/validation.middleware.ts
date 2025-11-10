import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodSchema, ZodIssue } from 'zod';

/**
 * Express middleware factory for Zod validation
 *
 * Validates request body/query/params against a Zod schema
 * Returns 400 Bad Request with field-specific errors on validation failure
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export function validateRequest(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate request against schema
      const validated = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      }) as { body?: unknown; query?: unknown; params?: unknown };

      // Store validated data in custom properties to avoid Express read-only issues
      if (validated.body) req.validatedBody = validated.body;
      if (validated.query) req.validatedQuery = validated.query as Record<string, unknown>;
      if (validated.params) req.validatedParams = validated.params as Record<string, unknown>;

      // Also try to update the original properties for backwards compatibility
      if (validated.body) req.body = validated.body as typeof req.body;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Transform Zod errors into field-specific error messages
        const errors = error.issues.map((err: ZodIssue) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        res.status(400).json({
          message: 'Validation error',
          errors,
        });
        return;
      }

      // Unexpected error
      console.error('Validation middleware error:', error);
      res.status(500).json({
        message: 'Internal server error during validation',
      });
    }
  };
}
