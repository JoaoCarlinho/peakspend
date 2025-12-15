/**
 * User Context Service
 *
 * Provides async-local-storage based user context injection for tenant isolation.
 * This allows the current user's identity to be accessed from anywhere in the
 * request handling chain without explicitly passing it through function arguments.
 *
 * Usage:
 *   // In middleware (set context)
 *   runWithUserContext({ userId: user.id, role: user.role }, async () => {
 *     await next();
 *   });
 *
 *   // Anywhere in the request handling chain (get context)
 *   const context = getUserContext();
 *   if (context?.userId) { ... }
 */

import { AsyncLocalStorage } from 'async_hooks';
import { UserRole } from '../generated/prisma';

/**
 * Error thrown when user context is required but not available
 */
export class NoUserContextError extends Error {
  constructor(operation?: string) {
    const message = operation
      ? `No user context available for operation: ${operation}. Ensure request is authenticated and userContextMiddleware is applied.`
      : 'No user context available. Ensure request is authenticated and userContextMiddleware is applied.';
    super(message);
    this.name = 'NoUserContextError';
  }
}

/**
 * User context interface for tenant isolation
 */
export interface UserContext {
  /** The authenticated user's ID */
  userId: string;
  /** The user's role (user, admin, security) */
  role: UserRole;
  /** Optional: bypass tenant isolation for admin operations */
  bypassTenantIsolation?: boolean;
  /** Optional: session ID for audit logging */
  sessionId?: string;
  /** Optional: request ID for tracing */
  requestId?: string;
}

/**
 * Async local storage for user context
 * This allows context to be accessed anywhere in the async call chain
 */
const userContextStorage = new AsyncLocalStorage<UserContext>();

/**
 * Run a function with user context set
 * The context will be available to all code called within the callback
 *
 * @param context - The user context to set
 * @param callback - The function to run with the context
 * @returns The result of the callback
 */
export function runWithUserContext<T>(context: UserContext, callback: () => T): T {
  return userContextStorage.run(context, callback);
}

/**
 * Run an async function with user context set
 * The context will be available to all code called within the callback
 *
 * @param context - The user context to set
 * @param callback - The async function to run with the context
 * @returns Promise resolving to the result of the callback
 */
export async function runWithUserContextAsync<T>(
  context: UserContext,
  callback: () => Promise<T>
): Promise<T> {
  return userContextStorage.run(context, callback);
}

/**
 * Get the current user context
 * Returns undefined if no context has been set (e.g., outside of a request)
 *
 * @returns The current user context, or undefined if not set
 */
export function getUserContext(): UserContext | undefined {
  return userContextStorage.getStore();
}

/**
 * Get the current user ID
 * Convenience method for tenant isolation
 *
 * @returns The current user ID, or undefined if not set
 */
export function getCurrentUserId(): string | undefined {
  return getUserContext()?.userId;
}

/**
 * Get the current user ID, throwing an error if not available
 *
 * @param operation - Optional operation name for error message
 * @returns The current user ID
 * @throws NoUserContextError if no context is available
 */
export function requireCurrentUserId(operation?: string): string {
  const userId = getCurrentUserId();
  if (!userId) {
    throw new NoUserContextError(operation);
  }
  return userId;
}

/**
 * Get the current user's role
 *
 * @returns The current user's role, or undefined if not set
 */
export function getCurrentUserRole(): UserRole | undefined {
  return getUserContext()?.role;
}

/**
 * Get the current user's role, throwing an error if not available
 *
 * @param operation - Optional operation name for error message
 * @returns The current user's role
 * @throws NoUserContextError if no context is available
 */
export function requireCurrentUserRole(operation?: string): UserRole {
  const role = getCurrentUserRole();
  if (!role) {
    throw new NoUserContextError(operation);
  }
  return role;
}

/**
 * Check if a user context exists
 *
 * @returns true if context exists, false otherwise
 */
export function hasUserContext(): boolean {
  return getUserContext() !== undefined;
}

/**
 * Check if tenant isolation bypass is enabled for the current context
 *
 * @returns true if bypass is enabled, false otherwise
 */
export function isTenantIsolationBypassed(): boolean {
  return getUserContext()?.bypassTenantIsolation === true;
}

/**
 * Check if the current user has admin role
 *
 * @returns true if the user is an admin, false otherwise
 */
export function isAdminUser(): boolean {
  const context = getUserContext();
  return context?.role === 'admin';
}

/**
 * Create a context with tenant isolation bypass enabled
 * Use sparingly - only for legitimate admin operations
 *
 * @param baseContext - The base user context
 * @returns A new context with bypassTenantIsolation set to true
 */
export function createBypassContext(baseContext: UserContext): UserContext {
  return {
    ...baseContext,
    bypassTenantIsolation: true,
  };
}
