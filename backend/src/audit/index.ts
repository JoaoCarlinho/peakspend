/**
 * Audit Module
 *
 * Provides audit logging, integrity verification, retention policy,
 * and API endpoints for the security audit system.
 *
 * Usage:
 *   import { auditLogger, AuditLogData } from '@/audit';
 *   await auditLogger.logLLMInteraction(data);
 */

// Type exports
export type {
  AuditLogData,
  AuditLogEntry,
  SecurityEventData,
  SecurityDecision,
  AuditQueueJob,
  AuditJobType,
  AuditJobOptions,
  QueueAddResult,
  PaginationMeta,
  AuditLogSummary,
  AuditLogDetail,
  AuditLogListResponse,
  AuditLogDetailResponse,
  AuditLogSearchFilters,
  AuditLogSearchResponse,
} from './types';

// Audit Logger Service exports
export { AuditLoggerService, auditLogger } from './auditLogger.service';

// Audit Exporter Service exports
export {
  AuditExporterService,
  auditExporter,
  ExportValidationError,
} from './auditExporter.service';
export type {
  ExportParams,
  SyncExportResult,
  AsyncExportResult,
  ExportResult,
} from './auditExporter.service';

// Retention Policy Service exports
export {
  RetentionPolicyService,
  retentionPolicy,
} from './retentionPolicy.service';
export type {
  PurgeResult,
  RetentionConfig,
  LegalHoldInfo,
} from './retentionPolicy.service';

// Retention Worker exports
export {
  startRetentionWorker,
  stopRetentionWorker,
  isRetentionJobRunning,
  triggerManualPurge,
} from './retentionPolicy.worker';

// Log Integrity Service exports
export {
  LogIntegrityService,
  logIntegrity,
} from './logIntegrity.service';
export type { VerificationResult } from './logIntegrity.service';

// Integrity Check Worker exports
export {
  startIntegrityCheckWorker,
  stopIntegrityCheckWorker,
  isIntegrityCheckRunning,
  triggerIntegrityCheck,
} from './integrityCheck.worker';

// Route exports
export { default as reviewQueueRoutes } from './reviewQueue.routes';
export { default as auditRoutes } from './audit.routes';
