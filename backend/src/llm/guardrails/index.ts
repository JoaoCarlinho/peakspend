/**
 * Guardrails Module - Input Inspection Layer
 *
 * This module provides input inspection for LLM-powered endpoints to
 * detect and block prompt injection attacks.
 *
 * Pipeline stages:
 * 1. Allow/Block list checking (immediate decisions)
 * 2. Pattern matching (known attack patterns)
 * 3. Anomaly scoring (novel attack detection)
 *
 * Usage:
 *   import { inputInspectorMiddleware } from '@/llm/guardrails';
 *   router.use('/api/insights', inputInspectorMiddleware);
 */

// Type exports
export type {
  InspectionDecision,
  PatternSeverity,
  PatternMatch,
  FactorScore,
  FactorBreakdown,
  AnomalyScore,
  ListCheckResult,
  InspectionContext,
  InspectionReasoning,
  InspectionMetadata,
  InspectionResult,
  InspectionAuditEntry,
  PatternConfig,
  CompiledPattern,
  PatternConfigFile,
  ListEntry,
  ListConfigFile,
  AnomalyRulesConfig,
  EscalationResult,
} from './types';

// Middleware exports
export {
  createInputInspectorMiddleware,
  inputInspectorMiddleware,
  InputBlockedError,
  EscalatedRequestError,
} from './inputInspector.middleware';

// Pipeline exports
export { InspectionPipeline, inspectionPipeline } from './inspectionPipeline';

// Pattern matcher exports
export { PatternMatcherService, patternMatcher } from './patternMatcher.service';

// Anomaly scorer exports
export { AnomalyScorerService, anomalyScorer } from './anomalyScorer.service';

// List checker exports
export { ListCheckerService, listChecker } from './listChecker.service';

// Escalation service exports
export { EscalationService, escalationService } from './escalation.service';

// PII Detector exports (Epic 5)
export {
  PIIDetectorService,
  piiDetector,
  PIIType,
  PIIConfidence,
} from './piiDetector.service';
export type { PIIMatch } from './piiDetector.service';

// Cross-User Detector exports (Epic 5)
export {
  CrossUserDetectorService,
  crossUserDetector,
} from './crossUserDetector.service';
export type {
  CrossUserMatch,
  CrossUserDetectionResult,
  CrossUserConfidence,
  PIIOwnership,
} from './crossUserDetector.service';

// PII Redactor exports (Epic 5)
export { PIIRedactorService, piiRedactor } from './piiRedactor.service';
export type {
  RedactionConfig,
  RedactionSummary,
  RedactionResult,
} from './piiRedactor.service';

// Output Inspector exports (Epic 5)
export {
  OutputInspectorService,
  outputInspector,
  OutputDecision,
  OutputInspectionError,
} from './outputInspector.service';
export type {
  OutputInspectionResult,
  OutputInspectionAuditEntry,
} from './outputInspector.service';
