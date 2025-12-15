/**
 * Tenant Isolation Service
 *
 * Service that enforces data isolation between users at the database query level.
 * This is a critical security layer that prevents unauthorized access to other
 * users' data, even if application code is compromised or LLM manipulation occurs.
 *
 * Features:
 * - Helper functions to apply userId filters to queries
 * - Support for admin bypass for legitimate admin operations
 * - Controlled by TENANT_ISOLATION_ENABLED feature flag
 *
 * Usage:
 *   import { applyTenantFilter, validateTenantAccess } from '@/security/tenantIsolation.middleware';
 *
 *   // In service layer:
 *   const expenses = await prisma.expense.findMany({
 *     where: applyTenantFilter({ categoryId: someId }),
 *   });
 */

import { securityConfigService } from './securityConfig.service';
import { getUserContext, isTenantIsolationBypassed } from './userContext.service';
import logger from '../config/logger';

/**
 * Models that require tenant isolation filtering
 * These models have a userId field that links records to specific users
 */
export const TENANT_FILTERED_MODELS: string[] = [
  'expense',
  'category',
  'mlModel',
  'trainingData',
];

/**
 * Operations that should be filtered by tenant (read operations)
 */
export const FILTERED_OPERATIONS: string[] = [
  'findMany',
  'findFirst',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
];

/**
 * Operations that modify data - these also need tenant filtering
 */
export const WRITE_FILTERED_OPERATIONS: string[] = [
  'update',
  'updateMany',
  'delete',
  'deleteMany',
];

/**
 * Error thrown when tenant isolation cannot be enforced
 */
export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

/**
 * Check if a model requires tenant filtering
 * @param model - The Prisma model name (lowercase)
 * @returns true if the model should be filtered by userId
 */
export function requiresTenantFiltering(model: string | undefined): boolean {
  if (!model) return false;
  return TENANT_FILTERED_MODELS.includes(model.toLowerCase());
}

/**
 * Check if an operation should be filtered
 * @param action - The Prisma operation name
 * @returns true if the operation should have tenant filtering applied
 */
export function isFilteredOperation(action: string): boolean {
  return FILTERED_OPERATIONS.includes(action) || WRITE_FILTERED_OPERATIONS.includes(action);
}

/**
 * Check if tenant isolation feature is enabled
 */
export function isTenantIsolationEnabled(): boolean {
  return securityConfigService.isFeatureEnabled('TENANT_ISOLATION_ENABLED');
}

/**
 * Get the current user ID for tenant filtering
 *
 * Returns undefined if:
 * - Feature is disabled
 * - Bypass is active
 * - No user context (in vulnerable mode)
 *
 * Throws TenantIsolationError if no user context in secure mode.
 *
 * @param model - The model being accessed (for logging)
 * @param operation - The operation being performed (for logging)
 * @returns userId for filtering, or undefined if filtering should be skipped
 */
export function getTenantUserId(model?: string, operation?: string): string | undefined {
  // Check if feature is enabled
  if (!isTenantIsolationEnabled()) {
    logger.debug('Tenant isolation disabled by feature flag');
    return undefined;
  }

  // Check for admin bypass
  if (isTenantIsolationBypassed()) {
    const context = getUserContext();
    logger.warn('Tenant isolation bypassed', {
      event: 'TENANT_ISOLATION_BYPASSED',
      model,
      operation,
      userId: context?.userId,
      role: context?.role,
    });
    return undefined;
  }

  // Get current user ID
  const context = getUserContext();
  const userId = context?.userId;

  if (!userId) {
    // No user context
    logger.warn('No user context for tenant-filtered operation', {
      event: 'TENANT_ISOLATION_NO_CONTEXT',
      model,
      operation,
    });

    // For safety, fail closed in secure mode
    if (securityConfigService.isSecureMode()) {
      throw new TenantIsolationError(
        `Cannot execute ${model || 'unknown'}.${operation || 'unknown'} without user context`
      );
    }

    return undefined;
  }

  if (model && operation) {
    logger.debug('Tenant isolation applied', { model, operation, userId });
  }

  return userId;
}

/**
 * Apply tenant filter to a where clause
 *
 * This is the primary function for enforcing tenant isolation.
 * Call this when building Prisma queries to automatically add userId filtering.
 *
 * @param where - Optional existing where clause
 * @param model - Optional model name for logging
 * @param operation - Optional operation name for logging
 * @returns Where clause with userId filter added, or original where if bypass
 *
 * @example
 * // Simple usage
 * const expenses = await prisma.expense.findMany({
 *   where: applyTenantFilter({ categoryId: someId }),
 * });
 *
 * // Without existing where
 * const allMyExpenses = await prisma.expense.findMany({
 *   where: applyTenantFilter(),
 * });
 */
export function applyTenantFilter<T extends Record<string, unknown>>(
  where?: T,
  model?: string,
  operation?: string
): T & { userId?: string } {
  const userId = getTenantUserId(model, operation);

  if (!userId) {
    // Return original where clause (or empty object) if no filtering needed
    return (where || {}) as T & { userId?: string };
  }

  // Add userId to where clause
  return {
    ...(where || {}),
    userId,
  } as T & { userId: string };
}

/**
 * Validate that a record belongs to the current user
 *
 * Use this to verify ownership before update/delete operations
 *
 * @param record - The record to validate (must have userId property)
 * @returns true if the record belongs to the current user
 * @throws TenantIsolationError if validation fails in secure mode
 */
export function validateTenantAccess(record: { userId: string } | null | undefined): boolean {
  if (!record) {
    return false;
  }

  const currentUserId = getTenantUserId();

  if (!currentUserId) {
    // No filtering active - allow access
    return true;
  }

  if (record.userId !== currentUserId) {
    logger.warn('Tenant access violation attempted', {
      event: 'TENANT_ACCESS_VIOLATION',
      recordUserId: record.userId,
      currentUserId,
    });

    if (securityConfigService.isSecureMode()) {
      throw new TenantIsolationError('Access denied: record belongs to another user');
    }

    return false;
  }

  return true;
}

/**
 * Create a where clause that includes only the userId filter
 *
 * Convenience function for queries that don't have other filters
 *
 * @returns Where clause with just userId, or empty object if no filtering
 */
export function getTenantWhereClause(): { userId: string } | Record<string, never> {
  const userId = getTenantUserId();
  if (!userId) {
    return {};
  }
  return { userId };
}
