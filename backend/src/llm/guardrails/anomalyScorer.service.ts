/**
 * Anomaly Scorer Service
 *
 * Calculates an anomaly score for input text based on multiple factors.
 * Works with pattern matching results to produce a final risk score.
 *
 * Scoring Factors:
 * - Pattern matches (from PatternMatcher)
 * - Input length anomalies
 * - Special character density
 * - Encoding detection (base64, unicode)
 * - Instruction-like language
 *
 * Score Range: 0.0 (safe) to 1.0 (malicious)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import logger from '../../config/logger';
import {
  PatternMatch,
  AnomalyScore,
  FactorBreakdown,
  FactorScore,
  InspectionDecision,
  AnomalyRulesConfig,
} from './types';

// Zod schemas for configuration validation
const ThresholdsSchema = z.object({
  block: z.number().min(0).max(1),
  escalate: z.number().min(0).max(1),
  allow: z.number().min(0).max(1),
});

const PatternMatchConfigSchema = z.object({
  weight: z.number().min(0).max(1),
  max_contribution: z.number().min(0).max(1),
  severity_weights: z.object({
    CRITICAL: z.number(),
    HIGH: z.number(),
    MEDIUM: z.number(),
    LOW: z.number(),
  }),
  diminishing_rate: z.number().min(0).max(1),
});

const InputLengthConfigSchema = z.object({
  weight: z.number().min(0).max(1),
  max_contribution: z.number().min(0).max(1),
  normal_range: z.object({
    min: z.number(),
    max: z.number(),
  }),
  extreme_thresholds: z.object({
    very_short: z.number(),
    very_long: z.number(),
  }),
});

const SpecialCharConfigSchema = z.object({
  weight: z.number().min(0).max(1),
  max_contribution: z.number().min(0).max(1),
  dangerous_chars: z.string(),
  threshold_density: z.number().min(0).max(1),
});

const EncodingConfigSchema = z.object({
  weight: z.number().min(0).max(1),
  max_contribution: z.number().min(0).max(1),
  patterns: z.array(z.string()),
});

const InstructionConfigSchema = z.object({
  weight: z.number().min(0).max(1),
  max_contribution: z.number().min(0).max(1),
  imperative_verbs: z.array(z.string()),
  conditional_words: z.array(z.string()),
  ai_references: z.array(z.string()),
});

const AnomalyRulesConfigSchema = z.object({
  version: z.string(),
  description: z.string(),
  thresholds: ThresholdsSchema,
  factors: z.object({
    pattern_match: PatternMatchConfigSchema,
    input_length: InputLengthConfigSchema,
    special_char_density: SpecialCharConfigSchema,
    encoding_detection: EncodingConfigSchema,
    instruction_language: InstructionConfigSchema,
  }),
});

/**
 * AnomalyScorerService - Calculates anomaly scores for input inspection
 *
 * Loads configuration from YAML and provides weighted scoring across
 * multiple factors. Returns a score (0.0-1.0) with factor breakdown.
 */
export class AnomalyScorerService {
  private config: AnomalyRulesConfig | null = null;
  private configPath: string;
  private loaded = false;

  constructor(configPath?: string) {
    this.configPath =
      configPath || path.join(process.cwd(), 'config', 'anomaly-rules.yaml');
  }

  /**
   * Load configuration from YAML file
   */
  private loadConfig(): void {
    if (this.loaded) return;

    try {
      const configContent = fs.readFileSync(this.configPath, 'utf-8');
      const rawConfig = yaml.load(configContent);
      this.config = AnomalyRulesConfigSchema.parse(rawConfig) as AnomalyRulesConfig;
      this.loaded = true;

      logger.info('Loaded anomaly scoring configuration', {
        thresholds: this.config.thresholds,
      });
    } catch (error) {
      logger.error('Failed to load anomaly rules configuration', {
        configPath: this.configPath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Use default configuration
      this.config = this.getDefaultConfig();
      this.loaded = true;
    }
  }

  /**
   * Get default configuration if YAML fails to load
   */
  private getDefaultConfig(): AnomalyRulesConfig {
    return {
      version: '1.0-default',
      description: 'Default anomaly rules',
      thresholds: {
        block: 0.7,
        escalate: 0.3,
        allow: 0.3,
      },
      factors: {
        pattern_match: {
          weight: 0.4,
          max_contribution: 0.6,
          severity_weights: { CRITICAL: 0.5, HIGH: 0.4, MEDIUM: 0.2, LOW: 0.1 },
          diminishing_rate: 0.7,
        },
        input_length: {
          weight: 0.15,
          max_contribution: 0.15,
          normal_range: { min: 10, max: 2000 },
          extreme_thresholds: { very_short: 5, very_long: 5000 },
        },
        special_char_density: {
          weight: 0.15,
          max_contribution: 0.15,
          dangerous_chars: '{}[]<>|;$#@!\\^`~',
          threshold_density: 0.1,
        },
        encoding_detection: {
          weight: 0.2,
          max_contribution: 0.2,
          patterns: ['base64', 'unicode_escape', 'url_encoding'],
        },
        instruction_language: {
          weight: 0.2,
          max_contribution: 0.2,
          imperative_verbs: ['do', 'execute', 'run', 'perform', 'print', 'show', 'tell'],
          conditional_words: ['if', 'when', 'unless', 'otherwise'],
          ai_references: ['you must', 'you will', 'you are', 'your instructions'],
        },
      },
    };
  }

  /**
   * Calculate anomaly score for input
   *
   * @param input - The input text to score
   * @param patterns - Pattern matches from PatternMatcher
   * @returns AnomalyScore with score, factors, and decision
   */
  score(input: string, patterns: PatternMatch[]): AnomalyScore {
    if (!this.loaded) {
      this.loadConfig();
    }

    // Config is accessed via this.config! in the scoring methods
    const factors: FactorBreakdown = {
      patternMatch: this.scorePatternMatches(patterns),
      inputLength: this.scoreInputLength(input),
      specialCharDensity: this.scoreSpecialChars(input),
      encodingDetection: this.scoreEncoding(input),
      instructionLanguage: this.scoreInstructionLanguage(input),
    };

    const totalScore = this.aggregateScores(factors);
    const decision = this.makeDecision(totalScore);

    // Log the scoring
    logger.debug('Anomaly score calculated', {
      event: 'ANOMALY_SCORE',
      totalScore,
      decision,
      factors: {
        patternMatch: factors.patternMatch.score,
        inputLength: factors.inputLength.score,
        specialCharDensity: factors.specialCharDensity.score,
        encodingDetection: factors.encodingDetection.score,
        instructionLanguage: factors.instructionLanguage.score,
      },
    });

    return { score: totalScore, factors, decision };
  }

  /**
   * Score based on pattern matches
   */
  private scorePatternMatches(patterns: PatternMatch[]): FactorScore {
    const config = this.config!.factors.pattern_match;

    if (patterns.length === 0) {
      return { score: 0, details: 'No patterns matched' };
    }

    const weights = config.severity_weights;
    const diminish = config.diminishing_rate;

    let score = 0;
    let contribution = 1.0;

    // Sort by severity (highest first)
    const sorted = [...patterns].sort(
      (a, b) => weights[b.severity] - weights[a.severity]
    );

    for (const pattern of sorted) {
      score += weights[pattern.severity] * contribution;
      contribution *= diminish; // Diminishing returns
    }

    const capped = Math.min(score, config.max_contribution);
    return {
      score: capped,
      details: `${patterns.length} patterns matched (severities: ${patterns.map((p) => p.severity).join(', ')})`,
    };
  }

  /**
   * Score based on input length anomalies
   */
  private scoreInputLength(input: string): FactorScore {
    const config = this.config!.factors.input_length;
    const len = input.length;

    // Normal range - no penalty
    if (len >= config.normal_range.min && len <= config.normal_range.max) {
      return { score: 0, details: `Length ${len} within normal range` };
    }

    let score = 0;
    let details = '';

    if (len < config.extreme_thresholds.very_short) {
      // Extremely short - maximum penalty
      score = config.max_contribution;
      details = `Length ${len} is extremely short (< ${config.extreme_thresholds.very_short})`;
    } else if (len < config.normal_range.min) {
      // Shorter than normal - proportional penalty
      score = ((config.normal_range.min - len) / config.normal_range.min) * config.max_contribution * 0.5;
      details = `Length ${len} is below normal (< ${config.normal_range.min})`;
    } else if (len > config.extreme_thresholds.very_long) {
      // Extremely long - maximum penalty
      score = config.max_contribution;
      details = `Length ${len} is extremely long (> ${config.extreme_thresholds.very_long})`;
    } else if (len > config.normal_range.max) {
      // Longer than normal - proportional penalty
      const excess = len - config.normal_range.max;
      const maxExcess = config.extreme_thresholds.very_long - config.normal_range.max;
      score = (excess / maxExcess) * config.max_contribution;
      details = `Length ${len} is above normal (> ${config.normal_range.max})`;
    }

    return {
      score: Math.min(score, config.max_contribution),
      details,
    };
  }

  /**
   * Score based on special character density
   */
  private scoreSpecialChars(input: string): FactorScore {
    const config = this.config!.factors.special_char_density;

    if (input.length === 0) {
      return { score: 0, details: 'Empty input' };
    }

    const dangerousChars = new Set(config.dangerous_chars.split(''));
    let count = 0;

    for (const char of input) {
      if (dangerousChars.has(char)) {
        count++;
      }
    }

    const density = count / input.length;

    if (density < config.threshold_density) {
      return {
        score: 0,
        details: `Special char density ${(density * 100).toFixed(1)}% below threshold`,
      };
    }

    // Scale score based on how much density exceeds threshold
    const excessDensity = density - config.threshold_density;
    const score = Math.min(excessDensity * 5, config.max_contribution); // Scale up

    return {
      score,
      details: `${count} special chars, density ${(density * 100).toFixed(1)}%`,
    };
  }

  /**
   * Score based on encoding detection
   */
  private scoreEncoding(input: string): FactorScore {
    const config = this.config!.factors.encoding_detection;
    const detections: string[] = [];

    // Base64 detection - long alphanumeric strings that could be base64
    // Must be at least 20 chars and divisible by 4 (or end with =)
    const base64Pattern = /[A-Za-z0-9+/]{20,}={0,2}/g;
    if (base64Pattern.test(input)) {
      detections.push('base64');
    }

    // Unicode escape detection - \uXXXX, %XX, &#xXXXX;
    const unicodePattern = /\\u[0-9a-fA-F]{4}|%[0-9a-fA-F]{2}|&#x[0-9a-fA-F]+;|&#\d+;/g;
    if (unicodePattern.test(input)) {
      detections.push('unicode/hex');
    }

    // URL encoding in suspicious contexts
    const urlEncodingPattern = /%[0-9a-fA-F]{2}.*(%[0-9a-fA-F]{2}){2,}/g;
    if (urlEncodingPattern.test(input)) {
      detections.push('url_encoding');
    }

    if (detections.length === 0) {
      return { score: 0, details: 'No encoding detected' };
    }

    const score = Math.min(detections.length * 0.1, config.max_contribution);
    return { score, details: `Detected: ${detections.join(', ')}` };
  }

  /**
   * Score based on instruction-like language
   */
  private scoreInstructionLanguage(input: string): FactorScore {
    const config = this.config!.factors.instruction_language;
    const lower = input.toLowerCase();
    let matches = 0;
    const matchedItems: string[] = [];

    // Check imperative verbs at word boundaries
    for (const verb of config.imperative_verbs) {
      const pattern = new RegExp(`\\b${verb}\\b`, 'i');
      if (pattern.test(lower)) {
        matches++;
        matchedItems.push(verb);
      }
    }

    // Check AI references (higher weight - these are more suspicious)
    for (const phrase of config.ai_references) {
      if (lower.includes(phrase.toLowerCase())) {
        matches += 2; // Higher weight for AI-directed language
        matchedItems.push(phrase);
      }
    }

    // Check conditional words (lower weight - common in normal language)
    for (const word of config.conditional_words) {
      const pattern = new RegExp(`\\b${word}\\b`, 'i');
      if (pattern.test(lower)) {
        matches += 0.5;
      }
    }

    if (matches === 0) {
      return { score: 0, details: 'No instruction language detected' };
    }

    const score = Math.min(matches * 0.05, config.max_contribution);
    return {
      score,
      details: `${Math.floor(matches)} instruction indicators (${matchedItems.slice(0, 3).join(', ')}${matchedItems.length > 3 ? '...' : ''})`,
    };
  }

  /**
   * Aggregate all factor scores
   */
  private aggregateScores(factors: FactorBreakdown): number {
    const total =
      factors.patternMatch.score +
      factors.inputLength.score +
      factors.specialCharDensity.score +
      factors.encodingDetection.score +
      factors.instructionLanguage.score;

    // Cap at 1.0
    return Math.min(total, 1.0);
  }

  /**
   * Make decision based on score
   */
  private makeDecision(score: number): InspectionDecision {
    const thresholds = this.config!.thresholds;

    if (score >= thresholds.block) return 'BLOCK';
    if (score >= thresholds.escalate) return 'ESCALATE';
    return 'ALLOW';
  }

  /**
   * Get current thresholds
   */
  getThresholds(): { block: number; escalate: number; allow: number } {
    if (!this.loaded) {
      this.loadConfig();
    }
    return { ...this.config!.thresholds };
  }

  /**
   * Reload configuration
   */
  reload(): void {
    this.loaded = false;
    this.config = null;
    this.loadConfig();
  }
}

// Export singleton instance
export const anomalyScorer = new AnomalyScorerService();
