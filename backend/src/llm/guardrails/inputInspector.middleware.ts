/**
 * Input Inspector Middleware
 *
 * Express middleware that intercepts requests to LLM-powered endpoints
 * and runs them through the input inspection pipeline.
 *
 * Endpoints protected:
 * - /api/receipts/ocr
 * - /api/insights/*
 *
 * Behavior:
 * - ALLOW: Request proceeds to handler
 * - BLOCK: Request rejected with 403
 * - ESCALATE: Request blocked pending human review (fail secure)
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../config/logger';
import { securityConfigService } from '../../security/securityConfig.service';
import { InspectionPipeline, inspectionPipeline } from './inspectionPipeline';
import { InspectionContext, InspectionResult, AnomalyScore } from './types';
import { escalationService } from './escalation.service';

// Extend Express Request to include inspection result
declare global {
  namespace Express {
    interface Request {
      inspectionResult?: InspectionResult;
      requestId?: string;
      sessionId?: string;
    }
  }
}

/**
 * Error class for blocked inputs
 * Returns generic message to avoid information leakage
 */
export class InputBlockedError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly metadata: Record<string, unknown> | undefined;

  constructor(metadata?: Record<string, unknown>) {
    super('Request blocked by security inspection');
    this.name = 'InputBlockedError';
    this.statusCode = 403;
    this.code = 'INPUT_BLOCKED';
    this.metadata = metadata ?? undefined;
  }
}

/**
 * Error class for escalated inputs
 * Returns 202 Accepted with friendly message
 */
export class EscalatedRequestError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly reviewId: string;

  constructor(reviewId: string) {
    super('Your request requires additional review and will be processed shortly');
    this.name = 'EscalatedRequestError';
    this.statusCode = 202;
    this.code = 'ESCALATED_FOR_REVIEW';
    this.reviewId = reviewId;
  }
}

/**
 * Extract text input from request for inspection
 * Looks in body, query params, and combines relevant fields
 */
function extractInputText(req: Request): string {
  const parts: string[] = [];

  // Check common request body fields for LLM endpoints
  if (req.body) {
    if (typeof req.body === 'string') {
      parts.push(req.body);
    } else {
      // Common field names used in LLM requests
      const textFields = ['prompt', 'query', 'message', 'text', 'input', 'content', 'question'];
      for (const field of textFields) {
        if (typeof req.body[field] === 'string') {
          parts.push(req.body[field]);
        }
      }

      // Also include any other string fields (for receipt OCR, etc.)
      if (typeof req.body.description === 'string') {
        parts.push(req.body.description);
      }
      if (typeof req.body.merchant === 'string') {
        parts.push(req.body.merchant);
      }
      if (typeof req.body.category === 'string') {
        parts.push(req.body.category);
      }
    }
  }

  // Check query parameters
  if (req.query) {
    const queryFields = ['q', 'query', 'search', 'prompt'];
    for (const field of queryFields) {
      if (typeof req.query[field] === 'string') {
        parts.push(req.query[field] as string);
      }
    }
  }

  return parts.join(' ').trim();
}

/**
 * Create the input inspector middleware
 *
 * @param pipeline - Optional custom pipeline instance (for testing)
 * @returns Express middleware function
 */
export function createInputInspectorMiddleware(
  pipeline: InspectionPipeline = inspectionPipeline
): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // Check feature flag - bypass if disabled
    if (!securityConfigService.isFeatureEnabled('INPUT_INSPECTION_ENABLED')) {
      logger.debug('Input inspection bypassed - feature disabled', {
        path: req.path,
        method: req.method,
      });
      return next();
    }

    try {
      // Build inspection context
      const context: InspectionContext = {
        userId: req.userId || 'anonymous',
        sessionId: req.sessionId || uuidv4(),
        requestId: req.requestId || uuidv4(),
        endpoint: req.path,
        input: extractInputText(req),
      };

      // Store requestId on request for downstream use
      req.requestId = context.requestId;

      // Skip inspection if no input to inspect
      if (!context.input) {
        logger.debug('Input inspection skipped - no input text', {
          path: req.path,
          method: req.method,
        });
        return next();
      }

      // Run inspection pipeline
      const result = await pipeline.inspect(context);

      // Attach result to request for downstream logging/auditing
      req.inspectionResult = result;

      // Handle decision
      switch (result.decision) {
        case 'ALLOW':
          return next();

        case 'BLOCK':
          logger.warn('Input blocked by inspection', {
            event: 'INPUT_BLOCKED',
            userId: context.userId,
            sessionId: context.sessionId,
            endpoint: context.endpoint,
            patternsMatched: result.reasoning.patternsMatched.length,
            anomalyScore: result.reasoning.anomalyScore,
            confidence: result.confidence,
          });
          throw new InputBlockedError({
            patternsMatched: result.reasoning.patternsMatched.length,
          });

        case 'ESCALATE':
          // Escalate to human review queue - creates SecurityEvent record
          const anomalyScore: AnomalyScore = {
            score: result.reasoning.anomalyScore,
            factors: result.reasoning.factorBreakdown || {
              patternMatch: { score: 0, details: '' },
              inputLength: { score: 0, details: '' },
              specialCharDensity: { score: 0, details: '' },
              encodingDetection: { score: 0, details: '' },
              instructionLanguage: { score: 0, details: '' },
            },
            decision: 'ESCALATE',
          };

          const escalationResult = await escalationService.escalate(context, anomalyScore);

          logger.warn('Input escalated for review', {
            event: 'INPUT_ESCALATED',
            eventId: escalationResult.eventId,
            userId: context.userId,
            sessionId: context.sessionId,
            endpoint: context.endpoint,
            anomalyScore: result.reasoning.anomalyScore,
            confidence: result.confidence,
          });

          throw new EscalatedRequestError(escalationResult.eventId);
      }
    } catch (error) {
      // Re-throw our custom errors
      if (error instanceof InputBlockedError || error instanceof EscalatedRequestError) {
        throw error;
      }

      // Security components fail closed - block on unexpected errors
      logger.error('Input inspection failed - blocking request (fail secure)', {
        event: 'INPUT_INSPECTION_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
        path: req.path,
      });
      throw new InputBlockedError({ internalError: true });
    }
  };
}

// Export default middleware instance
export const inputInspectorMiddleware = createInputInspectorMiddleware();
