/**
 * Security module exports
 *
 * This module provides centralized access to all security-related services
 * and types for the PeakSpend application.
 */

// Service exports
export { SecurityConfigService, securityConfigService } from './securityConfig.service';
export type { SecurityStatus } from './securityConfig.service';

// User context service (for tenant isolation)
export {
  runWithUserContext,
  runWithUserContextAsync,
  getUserContext,
  getCurrentUserId,
  requireCurrentUserId,
  getCurrentUserRole,
  requireCurrentUserRole,
  hasUserContext,
  isTenantIsolationBypassed,
  isAdminUser,
  createBypassContext,
  NoUserContextError,
} from './userContext.service';
export type { UserContext } from './userContext.service';

// User context middleware
export {
  userContextMiddleware,
  requireAuthWithContext,
  createUserContextMiddleware,
} from './userContext.middleware';

// Tenant isolation helper functions
export {
  applyTenantFilter,
  validateTenantAccess,
  getTenantWhereClause,
  getTenantUserId,
  isTenantIsolationEnabled,
  requiresTenantFiltering,
  isFilteredOperation,
  TenantIsolationError,
  TENANT_FILTERED_MODELS,
  FILTERED_OPERATIONS,
  WRITE_FILTERED_OPERATIONS,
} from './tenantIsolation.middleware';

// Security error classes
export {
  SecurityError,
  CrossUserAccessError,
  TenantIsolationViolationError,
  MissingUserContextError,
  SecurityConfigError,
  sessionCrossUserTracker,
  createCrossUserAccessEvent,
  detectCrossUserData,
} from './errors';

// Tool Permissions Service (for LLM Tool RBAC)
export {
  ToolPermissionsService,
  toolPermissionsService,
  ToolPermissionsConfigError,
} from './toolPermissions.service';
export type {
  Role,
  DataScope,
  ToolPermission,
  ToolPermissionsConfig,
  ToolRateLimit,
  ToolParameterRestriction,
} from './toolPermissions.service';
export type { AuthorizationResult } from './toolPermissions.types';

// RBAC Enforcer Service
export {
  RBACEnforcerService,
  rbacEnforcer,
  UnauthorizedToolAccessError,
  RateLimitExceededError,
} from './rbacEnforcer.service';

// RBAC Middleware
export { rbacMiddleware, createToolExecutionHandler } from './rbacMiddleware';
export type { ToolExecutionRequest } from './rbacMiddleware';

// Unauthorized Attempt Tracker
export { UnauthorizedAttemptTracker, attemptTracker } from './unauthorizedAttemptTracker';

// Session Tracker (for Anomaly Detection)
export {
  SessionTrackerService,
  sessionTracker,
  SlidingWindow,
} from './sessionTracker.service';
export type {
  SecurityDecision,
  PatternCategory,
  SessionMetrics,
  SessionData,
  SessionTrackerConfig,
} from './sessionTracker.service';

// Anomaly Detector Service
export {
  AnomalyDetectorService,
  anomalyDetector,
  AnomalyPatternType,
} from './anomalyDetector.service';
export type {
  AnomalyPattern,
  AnomalyDetectionResult,
  AnomalyDetectorConfig,
} from './anomalyDetector.service';

// Alert Service
export { AlertService, alertService, AlertSeverity } from './alertService';
export type { Alert, SecurityContext, AlertServiceConfig } from './alertService';

// Alert Destinations Service
export { AlertDestinationService, alertDestinationService } from './alertDestinations';
export type {
  WebhookConfig,
  EmailConfig,
  AlertDestination,
  DeliveryResult,
  RetryConfig,
  AlertDestinationsConfig,
} from './alertDestinations';

// Alert Configuration Service
export { AlertConfigService, alertConfigService } from './alertConfig';
export type {
  AlertConfig,
  ThresholdConfig,
  DestinationConfig,
  SuppressionConfig,
  RetryConfig as AlertRetryConfig,
  SeverityThresholds,
  ConfigReloadEvent,
  SanitizedDestinationConfig,
} from './alertConfig';

// Runtime Flags Service (for runtime feature flag toggling)
export { RuntimeFlagsService, runtimeFlagsService } from './runtimeFlags.service';
export type { FlagWithMetadata } from './runtimeFlags.service';

// Event Broadcaster Service (for real-time security event streaming)
export { EventBroadcasterService, eventBroadcaster } from './eventBroadcaster';
export type { BroadcastSecurityEvent } from './eventBroadcaster';

// Type exports from config
export type {
  SecurityMode,
  FeatureFlag,
  FeatureFlagState,
  SecurityConfig,
} from '../config/security.config';
