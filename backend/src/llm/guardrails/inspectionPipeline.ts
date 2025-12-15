/**
 * Inspection Pipeline
 *
 * Orchestrates the three-tier input inspection pipeline:
 * 1. Allow/Block list checking (immediate decision)
 * 2. Pattern matching (known attack detection)
 * 3. Anomaly scoring (novel attack detection)
 *
 * Decision thresholds:
 * - score < 0.3 → ALLOW (fast path)
 * - score > 0.7 → BLOCK (definite attack)
 * - 0.3 ≤ score ≤ 0.7 → ESCALATE to human review
 */

import * as crypto from 'crypto';
import logger from '../../config/logger';
import { securityConfigService } from '../../security/securityConfig.service';
import {
  InspectionContext,
  InspectionResult,
  InspectionDecision,
  InspectionReasoning,
  InspectionAuditEntry,
  PatternMatch,
  AnomalyScore,
  ListCheckResult,
} from './types';
import { patternMatcher as defaultPatternMatcher } from './patternMatcher.service';
import { anomalyScorer as defaultAnomalyScorer } from './anomalyScorer.service';
import { listChecker as defaultListChecker } from './listChecker.service';

/**
 * Interface for PatternMatcher service (to be implemented in Story 4.2)
 */
interface IPatternMatcher {
  match(input: string): PatternMatch[];
}

/**
 * Interface for AnomalyScorer service (to be implemented in Story 4.3)
 */
interface IAnomalyScorer {
  score(input: string, patterns: PatternMatch[]): AnomalyScore;
}

/**
 * Interface for ListChecker service (to be implemented in Story 4.4)
 */
interface IListChecker {
  check(input: string): ListCheckResult;
}

// NoOp implementations removed - using real implementations from services

/**
 * InspectionPipeline - Main orchestrator for input inspection
 *
 * Executes inspection stages in order:
 * 1. List checking (allow/block)
 * 2. Pattern matching
 * 3. Anomaly scoring
 * 4. Decision making
 */
export class InspectionPipeline {
  private patternMatcher: IPatternMatcher;
  private anomalyScorer: IAnomalyScorer;
  private listChecker: IListChecker;

  constructor(
    patternMatcher?: IPatternMatcher,
    anomalyScorer?: IAnomalyScorer,
    listChecker?: IListChecker
  ) {
    // Use provided implementations or defaults (all using real implementations)
    this.patternMatcher = patternMatcher || defaultPatternMatcher;
    this.anomalyScorer = anomalyScorer || defaultAnomalyScorer;
    this.listChecker = listChecker || defaultListChecker;
  }

  /**
   * Set the pattern matcher implementation
   * Used to inject real implementation after Story 4.2
   */
  public setPatternMatcher(matcher: IPatternMatcher): void {
    this.patternMatcher = matcher;
  }

  /**
   * Set the anomaly scorer implementation
   * Used to inject real implementation after Story 4.3
   */
  public setAnomalyScorer(scorer: IAnomalyScorer): void {
    this.anomalyScorer = scorer;
  }

  /**
   * Set the list checker implementation
   * Used to inject real implementation after Story 4.4
   */
  public setListChecker(checker: IListChecker): void {
    this.listChecker = checker;
  }

  /**
   * Main inspection method
   * Runs the full inspection pipeline and returns a decision
   */
  async inspect(context: InspectionContext): Promise<InspectionResult> {
    const startTime = Date.now();

    // Stage 0: Check allow/block lists first (immediate decision)
    const listResult = this.listChecker.check(context.input);
    if (listResult.match && listResult.decision) {
      const result = this.buildResult(
        listResult.decision,
        startTime,
        {
          patternsMatched: listResult.listId ? [listResult.listId] : [],
          anomalyScore: listResult.decision === 'BLOCK' ? 1.0 : 0.0,
        },
        context.input
      );

      // Log audit entry for list match decision
      this.logAuditEntry(context, result, listResult.listId);

      return result;
    }

    // Stage 1: Pattern matching
    const patterns = this.patternMatcher.match(context.input);

    // Stage 2: Anomaly scoring
    const anomalyResult = this.anomalyScorer.score(context.input, patterns);

    // Stage 3: Make decision based on score
    const decision = this.makeDecision(anomalyResult.score);

    const result = this.buildResult(
      decision,
      startTime,
      {
        patternsMatched: patterns.map((p) => p.patternId),
        anomalyScore: anomalyResult.score,
        factorBreakdown: anomalyResult.factors,
      },
      context.input
    );

    // Log audit entry for full pipeline decision
    this.logAuditEntry(context, result);

    return result;
  }

  /**
   * Make decision based on anomaly score
   *
   * Thresholds (configurable in anomaly-rules.yaml):
   * - < 0.3: ALLOW
   * - 0.3 - 0.7: ESCALATE
   * - > 0.7: BLOCK
   */
  private makeDecision(score: number): InspectionDecision {
    if (score < 0.3) return 'ALLOW';
    if (score > 0.7) return 'BLOCK';
    return 'ESCALATE';
  }

  /**
   * Build the complete inspection result
   */
  private buildResult(
    decision: InspectionDecision,
    startTime: number,
    reasoning: InspectionReasoning,
    input: string
  ): InspectionResult {
    const processingTimeMs = Date.now() - startTime;
    const inputHash = crypto.createHash('sha256').update(input).digest('hex');

    // Get active feature flags for metadata
    const flags = securityConfigService.getAllFlags();
    const activeFlags = Object.entries(flags)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name);

    const result: InspectionResult = {
      decision,
      tier: 1,
      confidence: this.calculateConfidence(reasoning.anomalyScore),
      reasoning,
      metadata: {
        processingTimeMs,
        featureFlagsActive: activeFlags,
        inputHash,
      },
    };

    // Log the inspection result
    logger.debug('Input inspection completed', {
      event: 'INPUT_INSPECTION_COMPLETE',
      decision,
      tier: 1,
      confidence: result.confidence,
      anomalyScore: reasoning.anomalyScore,
      patternsMatched: reasoning.patternsMatched.length,
      processingTimeMs,
    });

    return result;
  }

  /**
   * Calculate confidence in the decision
   * High confidence at score extremes (0 or 1), low in middle (0.5)
   */
  private calculateConfidence(score: number): number {
    // Confidence is highest at extremes (0 or 1) and lowest at 0.5
    return Math.abs(score - 0.5) * 2;
  }

  /**
   * Log comprehensive audit entry for inspection decision
   * Includes all details needed for security analysis while protecting privacy
   */
  private logAuditEntry(
    context: InspectionContext,
    result: InspectionResult,
    escalationEventId?: string
  ): void {
    // Build factor breakdown as simple Record<string, number>
    const factorBreakdown: Record<string, number> = {};
    if (result.reasoning.factorBreakdown) {
      const factors = result.reasoning.factorBreakdown;
      factorBreakdown['patternMatch'] = factors.patternMatch.score;
      factorBreakdown['inputLength'] = factors.inputLength.score;
      factorBreakdown['specialCharDensity'] = factors.specialCharDensity.score;
      factorBreakdown['encodingDetection'] = factors.encodingDetection.score;
      factorBreakdown['instructionLanguage'] = factors.instructionLanguage.score;
    }

    // Create audit entry
    const auditEntry: InspectionAuditEntry = {
      requestId: context.requestId,
      userId: context.userId,
      sessionId: context.sessionId,
      endpoint: context.endpoint,
      timestamp: new Date().toISOString(),
      inputHash: result.metadata.inputHash,
      inputLength: context.input.length,
      decision: result.decision,
      tier: result.tier,
      confidence: result.confidence,
      patternsMatched: result.reasoning.patternsMatched,
      anomalyScore: result.reasoning.anomalyScore,
      factorBreakdown,
      processingTimeMs: result.metadata.processingTimeMs,
      ...(escalationEventId ? { escalationEventId } : {}),
    };

    // Determine log level based on decision
    const logLevel = result.decision === 'BLOCK' ? 'warn' : 'info';

    // Log the audit entry
    logger[logLevel]('Input inspection audit', {
      event: 'INPUT_INSPECTION_AUDIT',
      ...auditEntry,
    });

    // Additional security log for BLOCK decisions
    if (result.decision === 'BLOCK') {
      logger.warn('Blocked potentially malicious input', {
        event: 'INPUT_BLOCKED_SECURITY',
        userId: context.userId,
        sessionId: context.sessionId,
        endpoint: context.endpoint,
        patternsMatched: result.reasoning.patternsMatched,
        anomalyScore: result.reasoning.anomalyScore,
        inputHash: result.metadata.inputHash,
      });
    }

    // Additional security log for ESCALATE decisions
    if (result.decision === 'ESCALATE') {
      logger.warn('Input escalated for human review', {
        event: 'INPUT_ESCALATED_SECURITY',
        userId: context.userId,
        sessionId: context.sessionId,
        endpoint: context.endpoint,
        escalationEventId,
        anomalyScore: result.reasoning.anomalyScore,
        inputHash: result.metadata.inputHash,
      });
    }
  }
}

// Export singleton pipeline instance
// Will be configured with real implementations as stories are completed
export const inspectionPipeline = new InspectionPipeline();
