/**
 * Anomaly Detector Service
 *
 * Detects attack patterns across requests using session tracking data.
 * Implements multiple detection algorithms for different attack types.
 *
 * Detects:
 * - Rapid requests: > 10 requests/minute
 * - Sequential injection attempts: 3+ blocked in session
 * - Probing behavior: varied attack vectors in sequence
 * - Gradual escalation: increasing anomaly scores
 *
 * Usage:
 *   import { anomalyDetector } from '@/security';
 *
 *   const result = await anomalyDetector.detectAnomalies(sessionId);
 *   if (result.isAnomalous) {
 *     // Handle anomaly based on result.recommendation
 *   }
 */

import { securityConfigService } from './securityConfig.service';
import {
  SessionTrackerService,
  sessionTracker,
  PatternCategory,
  SecurityDecision,
} from './sessionTracker.service';
import logger from '../config/logger';

/**
 * Anomaly pattern types
 */
export enum AnomalyPatternType {
  RAPID_REQUESTS = 'RAPID_REQUESTS',
  SEQUENTIAL_INJECTION = 'SEQUENTIAL_INJECTION',
  PROBING_BEHAVIOR = 'PROBING_BEHAVIOR',
  GRADUAL_ESCALATION = 'GRADUAL_ESCALATION',
}

/**
 * A detected anomaly pattern with confidence
 */
export interface AnomalyPattern {
  type: AnomalyPatternType;
  confidence: number; // 0.0 - 1.0
  details: Record<string, unknown>;
}

/**
 * Result of anomaly detection
 */
export interface AnomalyDetectionResult {
  isAnomalous: boolean;
  overallConfidence: number;
  patterns: AnomalyPattern[];
  sessionId: string;
  recommendation: 'MONITOR' | 'ALERT' | 'BLOCK_SESSION';
}

/**
 * Configuration for anomaly detection thresholds
 */
export interface AnomalyDetectorConfig {
  rapidRequestsPerMinute: number; // Default: 10
  sequentialBlocksToFlag: number; // Default: 3
  probingVectorThreshold: number; // Default: 3 unique categories
  escalationTrendThreshold: number; // Default: 0.1 increase per request
  patternWeights: Record<AnomalyPatternType, number>;
  recommendationThresholds: {
    monitor: number;
    alert: number;
    blockSession: number;
  };
}

/**
 * Anomaly Detector Service
 *
 * Singleton service for detecting anomalous patterns in user sessions.
 */
export class AnomalyDetectorService {
  private static instance: AnomalyDetectorService | null = null;

  private sessionTracker: SessionTrackerService;
  private config: AnomalyDetectorConfig;

  /**
   * Default configuration
   */
  private static readonly DEFAULT_CONFIG: AnomalyDetectorConfig = {
    rapidRequestsPerMinute: 10,
    sequentialBlocksToFlag: 3,
    probingVectorThreshold: 3,
    escalationTrendThreshold: 0.1,
    patternWeights: {
      [AnomalyPatternType.RAPID_REQUESTS]: 1.0,
      [AnomalyPatternType.SEQUENTIAL_INJECTION]: 1.5,
      [AnomalyPatternType.PROBING_BEHAVIOR]: 1.2,
      [AnomalyPatternType.GRADUAL_ESCALATION]: 0.8,
    },
    recommendationThresholds: {
      monitor: 0.3,
      alert: 0.6,
      blockSession: 0.8,
    },
  };

  private constructor(config?: Partial<AnomalyDetectorConfig>) {
    this.config = {
      ...AnomalyDetectorService.DEFAULT_CONFIG,
      ...config,
    };
    this.sessionTracker = sessionTracker;

    logger.info('AnomalyDetectorService initialized', {
      event: 'ANOMALY_DETECTOR_INIT',
      config: {
        rapidRequestsPerMinute: this.config.rapidRequestsPerMinute,
        sequentialBlocksToFlag: this.config.sequentialBlocksToFlag,
        probingVectorThreshold: this.config.probingVectorThreshold,
      },
    });
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<AnomalyDetectorConfig>): AnomalyDetectorService {
    if (!AnomalyDetectorService.instance) {
      AnomalyDetectorService.instance = new AnomalyDetectorService(config);
    }
    return AnomalyDetectorService.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    AnomalyDetectorService.instance = null;
  }

  /**
   * Detect anomalies for a session
   */
  public detectAnomalies(sessionId: string): AnomalyDetectionResult {
    // Check if anomaly detection is enabled
    if (!securityConfigService.isFeatureEnabled('ANOMALY_DETECTION_ENABLED')) {
      return this.createEmptyResult(sessionId);
    }

    const patterns: AnomalyPattern[] = [];

    // Check each pattern type
    const rapidRequests = this.detectRapidRequests(sessionId);
    if (rapidRequests) patterns.push(rapidRequests);

    const seqInjection = this.detectSequentialInjection(sessionId);
    if (seqInjection) patterns.push(seqInjection);

    const probing = this.detectProbingBehavior(sessionId);
    if (probing) patterns.push(probing);

    const escalation = this.detectGradualEscalation(sessionId);
    if (escalation) patterns.push(escalation);

    const overallConfidence = this.calculateOverallConfidence(patterns);
    const recommendation = this.getRecommendation(overallConfidence, patterns);

    const result: AnomalyDetectionResult = {
      isAnomalous: patterns.length > 0,
      overallConfidence,
      patterns,
      sessionId,
      recommendation,
    };

    if (result.isAnomalous) {
      logger.warn('Anomaly detected', {
        event: 'ANOMALY_DETECTED',
        sessionId,
        patternCount: patterns.length,
        patterns: patterns.map((p) => p.type),
        overallConfidence,
        recommendation,
      });
    }

    return result;
  }

  /**
   * Detect rapid requests pattern
   * Triggers when requests per minute exceeds threshold
   */
  private detectRapidRequests(sessionId: string): AnomalyPattern | null {
    const requestRate = this.sessionTracker.getRequestRate(sessionId);

    if (requestRate > this.config.rapidRequestsPerMinute) {
      // Calculate confidence based on how far over threshold
      const ratio = requestRate / this.config.rapidRequestsPerMinute;
      const confidence = Math.min((ratio - 1) * 0.5 + 0.5, 1.0);

      return {
        type: AnomalyPatternType.RAPID_REQUESTS,
        confidence,
        details: {
          requestsPerMinute: Math.round(requestRate * 100) / 100,
          threshold: this.config.rapidRequestsPerMinute,
          ratio: Math.round(ratio * 100) / 100,
        },
      };
    }

    return null;
  }

  /**
   * Detect sequential injection attempts
   * Triggers when N consecutive requests are blocked
   */
  private detectSequentialInjection(sessionId: string): AnomalyPattern | null {
    const recentDecisions = this.sessionTracker.getRecentDecisions(sessionId, 10);
    if (recentDecisions.length === 0) return null;

    // Count consecutive blocks from the end
    let consecutiveBlocks = 0;
    let maxConsecutive = 0;

    for (const decision of recentDecisions) {
      if (decision === 'BLOCK') {
        consecutiveBlocks++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveBlocks);
      } else {
        consecutiveBlocks = 0;
      }
    }

    if (maxConsecutive >= this.config.sequentialBlocksToFlag) {
      // Higher confidence for more consecutive blocks
      const confidence = Math.min(maxConsecutive / 5, 1.0);

      return {
        type: AnomalyPatternType.SEQUENTIAL_INJECTION,
        confidence,
        details: {
          consecutiveBlocks: maxConsecutive,
          threshold: this.config.sequentialBlocksToFlag,
          recentDecisions: recentDecisions.slice(-5),
        },
      };
    }

    return null;
  }

  /**
   * Detect probing behavior
   * Triggers when multiple different attack vector categories are tried
   */
  private detectProbingBehavior(sessionId: string): AnomalyPattern | null {
    const uniqueCategories = this.sessionTracker.getUniquePatternCategories(sessionId);

    if (uniqueCategories.length >= this.config.probingVectorThreshold) {
      // Higher confidence for more unique vectors
      const confidence = Math.min(uniqueCategories.length / 5, 1.0);

      return {
        type: AnomalyPatternType.PROBING_BEHAVIOR,
        confidence,
        details: {
          uniqueVectorCount: uniqueCategories.length,
          vectors: uniqueCategories,
          threshold: this.config.probingVectorThreshold,
        },
      };
    }

    return null;
  }

  /**
   * Detect gradual escalation
   * Triggers when anomaly scores show an increasing trend
   */
  private detectGradualEscalation(sessionId: string): AnomalyPattern | null {
    const scores = this.sessionTracker.getRecentAnomalyScores(sessionId);

    if (scores.length < 3) return null;

    // Calculate average increase between consecutive scores
    let totalIncrease = 0;
    let increaseCount = 0;

    for (let i = 1; i < scores.length; i++) {
      const prev = scores[i - 1];
      const curr = scores[i];
      if (prev !== undefined && curr !== undefined) {
        const diff = curr - prev;
        if (diff > 0) {
          totalIncrease += diff;
          increaseCount++;
        }
      }
    }

    const avgIncrease = increaseCount > 0 ? totalIncrease / increaseCount : 0;
    const trend = this.sessionTracker.getAnomalyTrend(sessionId);

    // Detect escalation if trend is positive and average increase exceeds threshold
    if (trend > 0 && avgIncrease > this.config.escalationTrendThreshold) {
      // Confidence based on how strong the trend is
      const confidence = Math.min(avgIncrease / 0.2, 1.0);

      return {
        type: AnomalyPatternType.GRADUAL_ESCALATION,
        confidence,
        details: {
          avgScoreIncrease: Math.round(avgIncrease * 1000) / 1000,
          threshold: this.config.escalationTrendThreshold,
          trend,
          recentScores: scores.slice(-5),
        },
      };
    }

    return null;
  }

  /**
   * Calculate overall confidence from detected patterns
   */
  private calculateOverallConfidence(patterns: AnomalyPattern[]): number {
    if (patterns.length === 0) return 0;

    // Weighted average of pattern confidences
    let totalWeight = 0;
    let weightedSum = 0;

    for (const pattern of patterns) {
      const weight = this.config.patternWeights[pattern.type] || 1.0;
      weightedSum += pattern.confidence * weight;
      totalWeight += weight;
    }

    const avgConfidence = weightedSum / totalWeight;

    // Boost confidence when multiple patterns detected (compound effect)
    const patternBoost = Math.min((patterns.length - 1) * 0.1, 0.3);

    return Math.min(avgConfidence + patternBoost, 1.0);
  }

  /**
   * Get recommendation based on confidence and patterns
   */
  private getRecommendation(
    confidence: number,
    patterns: AnomalyPattern[]
  ): 'MONITOR' | 'ALERT' | 'BLOCK_SESSION' {
    const thresholds = this.config.recommendationThresholds;

    // Immediate block for very high confidence or sequential injection
    if (confidence >= thresholds.blockSession) {
      return 'BLOCK_SESSION';
    }

    // Check for high-risk patterns that warrant immediate action
    const hasSequentialInjection = patterns.some(
      (p) => p.type === AnomalyPatternType.SEQUENTIAL_INJECTION && p.confidence > 0.7
    );
    if (hasSequentialInjection) {
      return 'BLOCK_SESSION';
    }

    // Alert for medium-high confidence
    if (confidence >= thresholds.alert) {
      return 'ALERT';
    }

    // Monitor for low-medium confidence
    if (confidence >= thresholds.monitor) {
      return 'MONITOR';
    }

    return 'MONITOR';
  }

  /**
   * Create empty result for disabled detection
   */
  private createEmptyResult(sessionId: string): AnomalyDetectionResult {
    return {
      isAnomalous: false,
      overallConfidence: 0,
      patterns: [],
      sessionId,
      recommendation: 'MONITOR',
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<AnomalyDetectorConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('AnomalyDetector config updated', {
      event: 'ANOMALY_DETECTOR_CONFIG_UPDATED',
      config,
    });
  }

  /**
   * Get current configuration
   */
  public getConfig(): Readonly<AnomalyDetectorConfig> {
    return Object.freeze({ ...this.config });
  }

  /**
   * Run detection after tracking a request (convenience method)
   */
  public trackAndDetect(
    sessionId: string,
    userId: string,
    anomalyScore: number,
    decision: SecurityDecision,
    patternCategory?: PatternCategory
  ): AnomalyDetectionResult {
    // Track the request
    this.sessionTracker.trackRequest(sessionId, userId, anomalyScore, decision, patternCategory);

    // Run detection
    return this.detectAnomalies(sessionId);
  }
}

// Export singleton instance
export const anomalyDetector = AnomalyDetectorService.getInstance();
