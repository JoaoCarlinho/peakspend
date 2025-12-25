/**
 * Audit Module Type Definitions
 *
 * Core types for the audit logging system including:
 * - AuditLogData: Input data for logging LLM interactions
 * - AuditLogEntry: Database-aligned entry format
 * - Queue job payloads and configurations
 */

/**
 * Security decision types for audit logging
 */
export type SecurityDecision = 'ALLOW' | 'BLOCK' | 'REDACT' | 'ESCALATE';

/**
 * Audit log data for LLM interactions
 */
export interface AuditLogData {
  // Request context
  userId: string;
  sessionId: string;
  requestId: string;
  endpoint: string;
  timestamp: Date;

  // Content (hashed for privacy - never store raw content)
  requestHash: string;
  responseHash: string;

  // Security decision
  securityDecision: SecurityDecision;
  tier?: 1 | 2 | 3;
  anomalyScore?: number;
  patternsMatched?: string[];

  // Performance
  processingMs: number;

  // Optional: escalation reference
  escalationEventId?: string;
}

/**
 * Audit log entry aligned with Prisma AuditLog model
 */
export interface AuditLogEntry {
  id: string;
  sequenceNum: number;
  previousHash: string | null;
  contentHash: string;
  timestamp: Date;
  userId: string | null;
  sessionId: string | null;
  requestId: string | null;
  endpoint: string | null;
  requestHash: string | null;
  responseHash: string | null;
  securityDecision: string | null;
  tier: number | null;
  anomalyScore: number | null;
  patternsMatched: string[];
  processingMs: number | null;
}

/**
 * Security event data for logging security-related events
 */
export interface SecurityEventData {
  eventType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  userId?: string;
  sessionId?: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

/**
 * Audit queue job types
 */
export type AuditJobType = 'llm-interaction' | 'security-event';

/**
 * Audit queue job payload
 */
export interface AuditQueueJob {
  type: AuditJobType;
  data: AuditLogData | SecurityEventData;
  priority: 'critical' | 'normal';
  timestamp: Date;
}

/**
 * Queue job options
 */
export interface AuditJobOptions {
  priority?: number;
  attempts?: number;
  backoff?: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
}

/**
 * Result of queue add operation
 */
export interface QueueAddResult {
  jobId: string;
  success: boolean;
}

/**
 * Pagination metadata for API responses
 */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore?: boolean;
}

/**
 * Audit log summary for list responses (excludes hash details)
 */
export interface AuditLogSummary {
  id: string;
  sequenceNum: number;
  timestamp: string;
  userId: string | null;
  sessionId: string | null;
  endpoint: string | null;
  securityDecision: string | null;
  tier: number | null;
  anomalyScore: number | null;
  processingMs: number | null;
}

/**
 * Full audit log detail (includes hashes for security role)
 */
export interface AuditLogDetail extends AuditLogSummary {
  requestId: string | null;
  patternsMatched: string[];
  requestHash: string | null;
  responseHash: string | null;
  contentHash: string;
  previousHash: string | null;
}

/**
 * Audit log list response
 */
export interface AuditLogListResponse {
  data: AuditLogSummary[];
  pagination: PaginationMeta;
}

/**
 * Audit log detail response
 */
export interface AuditLogDetailResponse {
  data: AuditLogDetail;
}

/**
 * Audit log search filters
 */
export interface AuditLogSearchFilters {
  userId?: string;
  endpoint?: string;
  startDate?: Date;
  endDate?: Date;
  securityDecision?: SecurityDecision[];
}

/**
 * Audit log search response
 */
export interface AuditLogSearchResponse {
  data: AuditLogSummary[];
  pagination: PaginationMeta;
  filters: AuditLogSearchFilters;
}
