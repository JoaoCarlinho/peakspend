/**
 * Escalation Service
 *
 * Handles escalation of suspicious inputs to human review queue.
 * Creates SecurityEvent records for tracking and provides review queue functionality.
 *
 * Escalation triggers when anomaly score is in the 0.3-0.7 range.
 * Requests are blocked pending review (fail-secure pattern).
 */

import * as crypto from 'crypto';
import logger from '../../config/logger';
import { getPrismaClient } from '../../config/database';
import { InspectionContext, AnomalyScore, EscalationResult } from './types';

/**
 * Severity levels for escalated requests
 */
type EscalationSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * EscalationService - Handles human review queue functionality
 *
 * Creates SecurityEvent records for escalated requests and provides
 * methods for reviewing and resolving them.
 */
export class EscalationService {
  /**
   * Escalate a request for human review
   *
   * Creates a SecurityEvent with type HUMAN_REVIEW_REQUIRED and returns
   * the event ID for tracking.
   *
   * @param context - The inspection context containing request details
   * @param score - The anomaly score result
   * @returns EscalationResult with event ID and status
   */
  async escalate(
    context: InspectionContext,
    score: AnomalyScore
  ): Promise<EscalationResult> {
    const prisma = getPrismaClient();

    // Calculate input hash for audit (don't store raw input)
    const inputHash = crypto.createHash('sha256').update(context.input).digest('hex');

    // Determine severity based on score
    const severity = this.calculateSeverity(score.score);

    try {
      // Create SecurityEvent record
      // Convert factorBreakdown to a plain JSON object for Prisma
      const factorBreakdown: Record<string, { score: number; details: string }> = {
        patternMatch: score.factors.patternMatch,
        inputLength: score.factors.inputLength,
        specialCharDensity: score.factors.specialCharDensity,
        encodingDetection: score.factors.encodingDetection,
        instructionLanguage: score.factors.instructionLanguage,
      };

      const event = await prisma.securityEvent.create({
        data: {
          eventType: 'HUMAN_REVIEW_REQUIRED',
          severity,
          userId: context.userId !== 'anonymous' ? context.userId : null,
          sessionId: context.sessionId,
          requestId: context.requestId,
          details: {
            endpoint: context.endpoint,
            inputHash,
            inputLength: context.input.length,
            anomalyScore: score.score,
            factorBreakdown,
            decision: score.decision,
            escalationReason: 'Score in escalation range (0.3-0.7)',
            timestamp: new Date().toISOString(),
          },
          status: 'PENDING',
          alertSent: false,
        },
      });

      // Log the escalation
      logger.warn('Request escalated for human review', {
        event: 'REQUEST_ESCALATED',
        eventId: event.id,
        userId: context.userId,
        sessionId: context.sessionId,
        requestId: context.requestId,
        endpoint: context.endpoint,
        anomalyScore: score.score,
        severity,
        contributingFactors: Object.entries(score.factors)
          .filter(([, factor]) => factor.score > 0)
          .map(([name]) => name),
      });

      return {
        eventId: event.id,
        status: 'PENDING',
        estimatedWait: '24 hours',
      };
    } catch (error) {
      // Log error but still return a result - fail secure
      logger.error('Failed to create escalation event', {
        event: 'ESCALATION_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: context.userId,
        sessionId: context.sessionId,
      });

      // Generate a fallback ID for tracking
      const fallbackId = crypto.randomUUID();

      return {
        eventId: fallbackId,
        status: 'PENDING',
        estimatedWait: '24 hours',
      };
    }
  }

  /**
   * Calculate severity based on anomaly score
   *
   * Higher scores within the escalation range get higher severity.
   */
  private calculateSeverity(score: number): EscalationSeverity {
    if (score >= 0.6) return 'HIGH';
    if (score >= 0.45) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Get pending reviews from the queue
   *
   * @param limit - Maximum number of reviews to return
   * @returns Array of pending review events
   */
  async getPendingReviews(limit: number = 50): Promise<
    Array<{
      id: string;
      timestamp: Date;
      userId: string | null;
      sessionId: string | null;
      severity: string;
      details: Record<string, unknown>;
    }>
  > {
    const prisma = getPrismaClient();

    const reviews = await prisma.securityEvent.findMany({
      where: {
        eventType: 'HUMAN_REVIEW_REQUIRED',
        status: 'PENDING',
      },
      orderBy: [{ severity: 'desc' }, { timestamp: 'asc' }],
      take: limit,
      select: {
        id: true,
        timestamp: true,
        userId: true,
        sessionId: true,
        severity: true,
        details: true,
      },
    });

    return reviews.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      userId: r.userId,
      sessionId: r.sessionId,
      severity: r.severity,
      details: r.details as Record<string, unknown>,
    }));
  }

  /**
   * Get a specific review by ID
   */
  async getReview(reviewId: string): Promise<{
    id: string;
    timestamp: Date;
    userId: string | null;
    sessionId: string | null;
    requestId: string | null;
    severity: string;
    status: string;
    details: Record<string, unknown>;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    resolution: string | null;
  } | null> {
    const prisma = getPrismaClient();

    const review = await prisma.securityEvent.findFirst({
      where: {
        id: reviewId,
        eventType: 'HUMAN_REVIEW_REQUIRED',
      },
    });

    if (!review) return null;

    return {
      id: review.id,
      timestamp: review.timestamp,
      userId: review.userId,
      sessionId: review.sessionId,
      requestId: review.requestId,
      severity: review.severity,
      status: review.status,
      details: review.details as Record<string, unknown>,
      reviewedBy: review.reviewedBy,
      reviewedAt: review.reviewedAt,
      resolution: review.resolution,
    };
  }

  /**
   * Resolve a review with a decision
   *
   * @param reviewId - The review event ID
   * @param action - The action taken (APPROVE, REJECT, DISMISS)
   * @param reviewerId - The ID of the reviewer
   * @param reason - Optional reason for the decision
   */
  async resolveReview(
    reviewId: string,
    action: 'APPROVE' | 'REJECT' | 'DISMISS',
    reviewerId: string,
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    const prisma = getPrismaClient();

    try {
      // Find the review
      const review = await prisma.securityEvent.findFirst({
        where: {
          id: reviewId,
          eventType: 'HUMAN_REVIEW_REQUIRED',
        },
      });

      if (!review) {
        return { success: false, message: 'Review not found' };
      }

      if (review.status !== 'PENDING') {
        return { success: false, message: 'Review already resolved' };
      }

      // Update the review status
      await prisma.securityEvent.update({
        where: { id: reviewId },
        data: {
          status: 'RESOLVED',
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          resolution: action,
          details: {
            ...(review.details as Record<string, unknown>),
            resolutionReason: reason,
            resolvedAt: new Date().toISOString(),
          },
        },
      });

      // Log the resolution
      logger.info('Review resolved', {
        event: 'REVIEW_RESOLVED',
        reviewId,
        action,
        reviewerId,
        reason,
        originalSeverity: review.severity,
      });

      // Handle specific actions
      if (action === 'APPROVE') {
        logger.info('Input approved - consider adding to allow list', {
          event: 'REVIEW_APPROVED',
          reviewId,
          reviewerId,
        });
      } else if (action === 'REJECT') {
        logger.warn('Input rejected - consider adding to block list', {
          event: 'REVIEW_REJECTED',
          reviewId,
          reviewerId,
        });
      }

      return { success: true, message: `Review ${action.toLowerCase()}ed successfully` };
    } catch (error) {
      logger.error('Failed to resolve review', {
        event: 'REVIEW_RESOLUTION_ERROR',
        reviewId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { success: false, message: 'Failed to resolve review' };
    }
  }

  /**
   * Get review queue statistics
   */
  async getQueueStats(): Promise<{
    pending: number;
    resolved: number;
    bySevertiy: Record<string, number>;
  }> {
    const prisma = getPrismaClient();

    const [pending, resolved, bySeverity] = await Promise.all([
      prisma.securityEvent.count({
        where: {
          eventType: 'HUMAN_REVIEW_REQUIRED',
          status: 'PENDING',
        },
      }),
      prisma.securityEvent.count({
        where: {
          eventType: 'HUMAN_REVIEW_REQUIRED',
          status: 'RESOLVED',
        },
      }),
      prisma.securityEvent.groupBy({
        by: ['severity'],
        where: {
          eventType: 'HUMAN_REVIEW_REQUIRED',
          status: 'PENDING',
        },
        _count: true,
      }),
    ]);

    const severityCounts: Record<string, number> = {};
    for (const item of bySeverity) {
      severityCounts[item.severity] = item._count;
    }

    return {
      pending,
      resolved,
      bySevertiy: severityCounts,
    };
  }
}

// Export singleton instance
export const escalationService = new EscalationService();
