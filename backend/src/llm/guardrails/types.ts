/**
 * Input Inspection Types
 *
 * Type definitions for the input inspection middleware and pipeline.
 * These types are used across all guardrail components.
 */

/**
 * Decision outcomes from the inspection pipeline
 */
export type InspectionDecision = 'ALLOW' | 'BLOCK' | 'ESCALATE';

/**
 * Severity levels for patterns and anomalies
 */
export type PatternSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Pattern match result from the PatternMatcher service
 */
export interface PatternMatch {
  patternId: string;
  category: string;
  name: string;
  severity: PatternSeverity;
  position: {
    start: number;
    end: number;
  };
  matchedText: string;
}

/**
 * Factor breakdown for anomaly scoring explanation
 */
export interface FactorScore {
  score: number;
  details: string;
}

/**
 * Complete factor breakdown from anomaly scoring
 */
export interface FactorBreakdown {
  patternMatch: FactorScore;
  inputLength: FactorScore;
  specialCharDensity: FactorScore;
  encodingDetection: FactorScore;
  instructionLanguage: FactorScore;
}

/**
 * Result from anomaly scoring
 */
export interface AnomalyScore {
  score: number;
  factors: FactorBreakdown;
  decision: InspectionDecision;
}

/**
 * Result from list checking (allow/block lists)
 */
export interface ListCheckResult {
  match: boolean;
  decision?: InspectionDecision;
  listId?: string;
  listType?: 'allow' | 'block';
  reason?: string;
}

/**
 * Context passed through the inspection pipeline
 */
export interface InspectionContext {
  userId: string;
  sessionId: string;
  requestId: string;
  endpoint: string;
  input: string;
}

/**
 * Reasoning details included in inspection result
 */
export interface InspectionReasoning {
  patternsMatched: string[];
  anomalyScore: number;
  factorBreakdown?: FactorBreakdown;
}

/**
 * Metadata included in inspection result
 */
export interface InspectionMetadata {
  processingTimeMs: number;
  featureFlagsActive: string[];
  inputHash: string;
}

/**
 * Complete result from the inspection pipeline
 */
export interface InspectionResult {
  decision: InspectionDecision;
  tier: 1 | 2 | 3;
  confidence: number;
  reasoning: InspectionReasoning;
  metadata: InspectionMetadata;
}

/**
 * Audit entry for inspection decisions
 */
export interface InspectionAuditEntry {
  requestId: string;
  userId: string;
  sessionId: string;
  endpoint: string;
  timestamp: string;
  inputHash: string;
  inputLength: number;
  decision: InspectionDecision;
  tier: 1 | 2 | 3;
  confidence: number;
  patternsMatched: string[];
  anomalyScore: number;
  factorBreakdown?: Record<string, number>;
  processingTimeMs: number;
  escalationEventId?: string;
}

/**
 * Pattern configuration from YAML file
 */
export interface PatternConfig {
  id: string;
  category: string;
  name: string;
  pattern: string;
  flags?: string;
  severity: PatternSeverity;
  description: string;
}

/**
 * Compiled pattern with RegExp
 */
export interface CompiledPattern extends PatternConfig {
  regex: RegExp;
}

/**
 * Pattern configuration file schema
 */
export interface PatternConfigFile {
  version: string;
  description: string;
  categories: Array<{
    id: string;
    name: string;
    severity: PatternSeverity;
  }>;
  patterns: PatternConfig[];
}

/**
 * Allow/block list entry
 */
export interface ListEntry {
  id: string;
  pattern: string;
  type: 'exact' | 'regex';
  reason: string;
  added_by: string;
  added_at: string;
}

/**
 * Allow/block list configuration file schema
 */
export interface ListConfigFile {
  version: string;
  description: string;
  allow_list: ListEntry[];
  block_list: ListEntry[];
}

/**
 * Anomaly rules configuration
 */
export interface AnomalyRulesConfig {
  version: string;
  description: string;
  thresholds: {
    block: number;
    escalate: number;
    allow: number;
  };
  factors: {
    pattern_match: {
      weight: number;
      max_contribution: number;
      severity_weights: Record<PatternSeverity, number>;
      diminishing_rate: number;
    };
    input_length: {
      weight: number;
      max_contribution: number;
      normal_range: { min: number; max: number };
      extreme_thresholds: { very_short: number; very_long: number };
    };
    special_char_density: {
      weight: number;
      max_contribution: number;
      dangerous_chars: string;
      threshold_density: number;
    };
    encoding_detection: {
      weight: number;
      max_contribution: number;
      patterns: string[];
    };
    instruction_language: {
      weight: number;
      max_contribution: number;
      imperative_verbs: string[];
      conditional_words: string[];
      ai_references: string[];
    };
  };
}

/**
 * Escalation result when input is sent to human review
 */
export interface EscalationResult {
  eventId: string;
  status: 'PENDING';
  estimatedWait: string;
}
