/**
 * Output Inspector Service
 *
 * Main orchestrator for the output inspection pipeline. Coordinates
 * PII detection, cross-user data detection, and redaction to protect
 * against data leakage.
 *
 * Decision Flow:
 * 1. Check feature flag (bypass if disabled)
 * 2. Detect all PII in response
 * 3. Check for cross-user data
 * 4. Block if HIGH confidence cross-user data
 * 5. Redact remaining PII and allow
 */

import * as crypto from 'crypto';
import { getPrismaClient } from '../../config/database';
import logger from '../../config/logger';
import { securityConfigService } from '../../security/securityConfig.service';
import {
  getUserContext,
  getCurrentUserId,
} from '../../security/userContext.service';
import {
  PIIDetectorService,
  piiDetector,
  PIIMatch,
  PIIType,
} from './piiDetector.service';
import {
  CrossUserDetectorService,
  crossUserDetector,
  CrossUserDetectionResult,
} from './crossUserDetector.service';
import {
  PIIRedactorService,
  piiRedactor,
  RedactionSummary,
} from './piiRedactor.service';

/**
 * Output inspection decisions
 */
export enum OutputDecision {
  ALLOW = 'ALLOW', // No PII found, pass through
  REDACT = 'REDACT', // Current user's PII found, redact and pass
  BLOCK = 'BLOCK', // Cross-user data found, block entirely
}

/**
 * Audit entry for output inspection decisions
 */
export interface OutputInspectionAuditEntry {
  requestId: string;
  userId: string;
  sessionId: string;
  endpoint: string;
  timestamp: string;
  responseHash: string;
  responseLength: number;
  decision: OutputDecision;
  piiTypesFound: PIIType[];
  piiMatchCount: number;
  redactionCount: number;
  redactionsByType: Partial<Record<PIIType, number>>;
  crossUserDataDetected: boolean;
  crossUserMatchCount: number;
  processingTimeMs: number;
  securityEventId?: string;
}

/**
 * Result of output inspection
 */
export interface OutputInspectionResult {
  decision: OutputDecision;
  originalResponse: string;
  processedResponse?: string;
  blockReason?: string;
  redactionSummary?: RedactionSummary;
  securityEventId?: string;
  processingTimeMs: number;
}

/**
 * Error thrown when output is blocked due to cross-user data
 * Intentionally generic to prevent info leakage
 */
export class OutputInspectionError extends Error {
  public readonly eventId: string | undefined;

  constructor(eventId?: string) {
    // Generic message - never expose what was detected
    super('Unable to process request');
    this.name = 'OutputInspectionError';
    if (eventId) {
      this.eventId = eventId;
    }
  }
}

/**
 * Output Inspector Service
 */
export class OutputInspectorService {
  private piiDetectorInstance: PIIDetectorService;
  private crossUserDetectorInstance: CrossUserDetectorService;
  private piiRedactorInstance: PIIRedactorService;

  constructor(
    piiDetectorService?: PIIDetectorService,
    crossUserDetectorService?: CrossUserDetectorService,
    piiRedactorService?: PIIRedactorService
  ) {
    this.piiDetectorInstance = piiDetectorService || piiDetector;
    this.crossUserDetectorInstance =
      crossUserDetectorService || crossUserDetector;
    this.piiRedactorInstance = piiRedactorService || piiRedactor;
  }

  /**
   * Inspect an LLM response for PII and cross-user data
   */
  async inspect(
    response: string,
    userId?: string
  ): Promise<OutputInspectionResult> {
    const startTime = Date.now();
    const currentUserId = userId || getCurrentUserId() || 'anonymous';

    // Check feature flag
    if (!securityConfigService.isFeatureEnabled('OUTPUT_INSPECTION_ENABLED')) {
      logger.debug('Output inspection bypassed (disabled)', {
        event: 'OUTPUT_INSPECTION_BYPASSED',
        reason: 'feature_disabled',
      });
      return {
        decision: OutputDecision.ALLOW,
        originalResponse: response,
        processedResponse: response,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Step 1: Detect all PII in the response
    const piiMatches = this.piiDetectorInstance.detectPII(response);

    if (piiMatches.length === 0) {
      // No PII found - allow response as-is
      const processingTimeMs = Date.now() - startTime;

      // Log audit entry for ALLOW decision
      this.logAuditEntry({
        decision: OutputDecision.ALLOW,
        userId: currentUserId,
        response,
        piiMatches: [],
        processingTimeMs,
      });

      logger.debug('Output inspection complete - no PII found', {
        event: 'OUTPUT_INSPECTION_ALLOW',
        userId: currentUserId,
        piiFound: 0,
      });
      return {
        decision: OutputDecision.ALLOW,
        originalResponse: response,
        processedResponse: response,
        processingTimeMs,
      };
    }

    // Step 2: Check for cross-user data
    const crossUserResult =
      await this.crossUserDetectorInstance.detectCrossUserData(
        response,
        currentUserId
      );

    if (crossUserResult.hasCrossUserData) {
      // Check for HIGH confidence cross-user matches
      const highConfidenceMatches = crossUserResult.matches.filter(
        (m) => m.confidence === 'HIGH'
      );

      if (highConfidenceMatches.length > 0) {
        // BLOCK: Cross-user data with high confidence
        const eventId = await this.createBlockSecurityEvent(
          crossUserResult,
          piiMatches
        );
        await this.generateAlert(eventId, crossUserResult);

        const processingTimeMs = Date.now() - startTime;

        // Log audit entry for BLOCK decision
        this.logAuditEntry({
          decision: OutputDecision.BLOCK,
          userId: currentUserId,
          response,
          piiMatches,
          crossUserResult,
          processingTimeMs,
          securityEventId: eventId,
        });

        logger.warn('Output blocked - cross-user data detected', {
          event: 'OUTPUT_INSPECTION_BLOCK',
          userId: currentUserId,
          eventId,
          matchTypes: highConfidenceMatches.map((m) => m.type),
          matchCount: highConfidenceMatches.length,
        });

        return {
          decision: OutputDecision.BLOCK,
          originalResponse: response,
          blockReason: 'Cross-user data detected',
          securityEventId: eventId,
          processingTimeMs,
        };
      }
    }

    // Step 3: Redact any PII (at this point, it's current user's data or unknown)
    const redactionResult = this.piiRedactorInstance.redact(
      response,
      piiMatches
    );

    const processingTimeMs = Date.now() - startTime;

    // Log audit entry
    this.logAuditEntry({
      decision: OutputDecision.REDACT,
      userId: currentUserId,
      response,
      piiMatches,
      crossUserResult,
      redactionSummary: redactionResult.summary,
      processingTimeMs,
    });

    logger.debug('Output inspection complete - redacted PII', {
      event: 'OUTPUT_INSPECTION_REDACT',
      userId: currentUserId,
      totalRedactions: redactionResult.summary.totalRedactions,
      redactionTypes: Object.keys(redactionResult.summary.byType),
    });

    return {
      decision: OutputDecision.REDACT,
      originalResponse: response,
      processedResponse: redactionResult.redactedText,
      redactionSummary: redactionResult.summary,
      processingTimeMs,
    };
  }

  /**
   * Create a security event when blocking cross-user data
   */
  private async createBlockSecurityEvent(
    crossUserResult: CrossUserDetectionResult,
    piiMatches: PIIMatch[]
  ): Promise<string> {
    const prisma = getPrismaClient();
    const context = getUserContext();

    try {
      const event = await prisma.securityEvent.create({
        data: {
          eventType: 'CROSS_USER_DATA_BLOCKED',
          severity: 'CRITICAL',
          userId:
            crossUserResult.currentUserId !== 'anonymous'
              ? crossUserResult.currentUserId
              : null,
          sessionId: context?.sessionId || null,
          requestId: context?.requestId || null,
          details: {
            // Pattern types only - NEVER log actual values
            patternsDetected: [
              ...new Set(crossUserResult.matches.map((m) => m.type)),
            ],
            crossUserMatchCount: crossUserResult.matches.length,
            highConfidenceCount: crossUserResult.matches.filter(
              (m) => m.confidence === 'HIGH'
            ).length,
            totalPIIFound: piiMatches.length,
            piiTypesFound: [...new Set(piiMatches.map((m) => m.type))],
            timestamp: new Date().toISOString(),
          },
          status: 'PENDING',
          alertSent: false,
        },
      });

      return event.id;
    } catch (error) {
      logger.error('Failed to create security event for blocked output', {
        event: 'OUTPUT_BLOCK_EVENT_ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
      // Return a placeholder ID - the block should still happen
      return `blocked-${Date.now()}`;
    }
  }

  /**
   * Generate an alert for the blocked response
   */
  private async generateAlert(
    eventId: string,
    crossUserResult: CrossUserDetectionResult
  ): Promise<void> {
    const prisma = getPrismaClient();

    try {
      // Log the alert (actual webhook/email would be implemented in a separate alert service)
      logger.warn('SECURITY ALERT: Cross-user data blocked', {
        event: 'SECURITY_ALERT_CROSS_USER_BLOCK',
        severity: 'CRITICAL',
        eventId,
        userId: crossUserResult.currentUserId,
        matchTypes: [...new Set(crossUserResult.matches.map((m) => m.type))],
        matchCount: crossUserResult.matches.length,
        message:
          'LLM response contained data belonging to another user and was blocked',
      });

      // Mark event as alert sent
      await prisma.securityEvent.update({
        where: { id: eventId },
        data: { alertSent: true },
      });
    } catch (error) {
      logger.error('Failed to generate alert for blocked output', {
        event: 'OUTPUT_BLOCK_ALERT_ERROR',
        eventId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Convenience method to inspect and throw if blocked
   * Use this in services where you want automatic error throwing
   */
  async inspectOrThrow(response: string, userId?: string): Promise<string> {
    const result = await this.inspect(response, userId);

    switch (result.decision) {
      case OutputDecision.ALLOW:
        return result.processedResponse!;
      case OutputDecision.REDACT:
        return result.processedResponse!;
      case OutputDecision.BLOCK:
        throw new OutputInspectionError(result.securityEventId);
    }
  }

  /**
   * Log an audit entry for output inspection
   */
  private logAuditEntry(params: {
    decision: OutputDecision;
    userId: string;
    response: string;
    piiMatches: PIIMatch[];
    crossUserResult?: CrossUserDetectionResult;
    redactionSummary?: RedactionSummary;
    processingTimeMs: number;
    securityEventId?: string;
  }): void {
    const context = getUserContext();

    // Hash the response content - never log raw content
    const responseHash = crypto
      .createHash('sha256')
      .update(params.response)
      .digest('hex')
      .substring(0, 16); // First 16 chars for brevity

    const auditEntry: OutputInspectionAuditEntry = {
      requestId: context?.requestId || `req-${Date.now()}`,
      userId: params.userId,
      sessionId: context?.sessionId || 'unknown',
      endpoint: 'llm-output', // Endpoint tracked at middleware level, not in UserContext
      timestamp: new Date().toISOString(),
      responseHash,
      responseLength: params.response.length,
      decision: params.decision,
      piiTypesFound: [...new Set(params.piiMatches.map((m) => m.type))],
      piiMatchCount: params.piiMatches.length,
      redactionCount: params.redactionSummary?.totalRedactions || 0,
      redactionsByType: params.redactionSummary?.byType || {},
      crossUserDataDetected: params.crossUserResult?.hasCrossUserData || false,
      crossUserMatchCount: params.crossUserResult?.matches.length || 0,
      processingTimeMs: params.processingTimeMs,
    };

    // Only include securityEventId if it exists
    if (params.securityEventId) {
      auditEntry.securityEventId = params.securityEventId;
    }

    // Log structured audit entry
    logger.info('Output inspection audit', {
      event: 'OUTPUT_INSPECTION_AUDIT',
      audit: auditEntry,
    });
  }

  /**
   * Check if output inspection is enabled
   */
  isEnabled(): boolean {
    return securityConfigService.isFeatureEnabled('OUTPUT_INSPECTION_ENABLED');
  }

  /**
   * Get inspection statistics (for monitoring)
   */
  getCapabilities(): {
    piiTypes: PIIType[];
    crossUserDetection: boolean;
    redactionEnabled: boolean;
  } {
    const piiCapabilities = this.piiDetectorInstance.getCapabilities();
    return {
      piiTypes: piiCapabilities.types,
      crossUserDetection: true,
      redactionEnabled: true,
    };
  }
}

// Export singleton instance
export const outputInspector = new OutputInspectorService();
