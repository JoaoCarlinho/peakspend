/**
 * Cross-User Data Detector Service
 *
 * Detects when LLM responses contain data belonging to users other than
 * the authenticated user. This is a critical security control to prevent
 * cross-user data leakage.
 *
 * Detection Strategy:
 * 1. Load current user's known identifiers (email, name, account numbers)
 * 2. Use PIIDetector to find all PII in the response
 * 3. Filter to PII that doesn't belong to the current user
 * 4. Return matches with confidence levels
 */

import { getPrismaClient } from '../../config/database';
import logger from '../../config/logger';
import { getCurrentUserId } from '../../security/userContext.service';
import { PIIDetectorService, piiDetector, PIIType, PIIMatch } from './piiDetector.service';

/**
 * Confidence levels for cross-user data detection
 */
export type CrossUserConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Ownership determination for detected PII
 */
export type PIIOwnership = 'CURRENT_USER' | 'OTHER_USER' | 'UNKNOWN';

/**
 * A detected cross-user data match
 */
export interface CrossUserMatch {
  type: PIIType;
  value: string;
  start: number;
  end: number;
  belongsTo: PIIOwnership;
  suspectedUserId?: string;
  confidence: CrossUserConfidence;
}

/**
 * Result of cross-user data detection
 */
export interface CrossUserDetectionResult {
  hasCrossUserData: boolean;
  matches: CrossUserMatch[];
  currentUserId: string;
  totalPIIFound: number;
  processingTimeMs: number;
}

/**
 * User identifiers for matching
 */
interface UserIdentifiers {
  userId: string;
  email: string;
  name: string | null;
  normalizedEmail: string;
  normalizedName: string | null;
  accountPatterns: string[];
}

/**
 * Simple in-memory cache with TTL
 */
class IdentifierCache {
  private cache = new Map<string, { value: UserIdentifiers; expires: number }>();
  private readonly ttlMs: number;

  constructor(ttlSeconds: number = 300) {
    this.ttlMs = ttlSeconds * 1000;
  }

  get(key: string): UserIdentifiers | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: UserIdentifiers): void {
    this.cache.set(key, {
      value,
      expires: Date.now() + this.ttlMs,
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Cross-User Data Detector Service
 */
export class CrossUserDetectorService {
  private piiDetectorInstance: PIIDetectorService;
  private identifierCache: IdentifierCache;
  private allUsersEmailCache: Map<string, string> | null = null;
  private allUsersEmailCacheExpires = 0;
  private readonly allUsersCacheTtlMs = 60000; // 1 minute cache for all users

  constructor(piiDetectorService?: PIIDetectorService) {
    this.piiDetectorInstance = piiDetectorService || piiDetector;
    this.identifierCache = new IdentifierCache(300); // 5 minute TTL
  }

  /**
   * Detect cross-user data in text
   */
  async detectCrossUserData(
    text: string,
    userId?: string
  ): Promise<CrossUserDetectionResult> {
    const startTime = Date.now();

    // Get current user ID from context or parameter
    const currentUserId = userId || getCurrentUserId();
    if (!currentUserId) {
      logger.warn('Cross-user detection called without user context', {
        event: 'CROSS_USER_NO_CONTEXT',
      });
      return {
        hasCrossUserData: false,
        matches: [],
        currentUserId: 'anonymous',
        totalPIIFound: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Load current user's identifiers
    const currentUserIdentifiers = await this.loadUserIdentifiers(currentUserId);

    // Find all PII in the response
    const piiMatches = this.piiDetectorInstance.detectPII(text);

    if (piiMatches.length === 0) {
      return {
        hasCrossUserData: false,
        matches: [],
        currentUserId,
        totalPIIFound: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Load email map for cross-referencing
    const emailToUserMap = await this.loadAllUsersEmailMap();

    // Classify each PII match
    const crossUserMatches: CrossUserMatch[] = [];
    for (const piiMatch of piiMatches) {
      const classification = this.classifyPII(
        piiMatch,
        currentUserIdentifiers,
        emailToUserMap
      );

      // Only include non-current-user matches
      if (classification.belongsTo !== 'CURRENT_USER') {
        crossUserMatches.push(classification);
      }
    }

    const processingTimeMs = Date.now() - startTime;

    // Log if cross-user data was found
    if (crossUserMatches.length > 0) {
      logger.warn('Cross-user data detected in response', {
        event: 'CROSS_USER_DATA_DETECTED',
        userId: currentUserId,
        matchCount: crossUserMatches.length,
        matchTypes: crossUserMatches.map((m) => m.type),
        processingTimeMs,
      });
    }

    return {
      hasCrossUserData: crossUserMatches.length > 0,
      matches: crossUserMatches,
      currentUserId,
      totalPIIFound: piiMatches.length,
      processingTimeMs,
    };
  }

  /**
   * Load user identifiers from database
   */
  private async loadUserIdentifiers(userId: string): Promise<UserIdentifiers> {
    // Check cache first
    const cached = this.identifierCache.get(userId);
    if (cached) return cached;

    const prisma = getPrismaClient();

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      if (!user) {
        logger.warn('User not found for cross-user detection', {
          event: 'CROSS_USER_USER_NOT_FOUND',
          userId,
        });
        return this.createEmptyIdentifiers(userId);
      }

      // Extract account patterns from expenses (merchant/notes that look like accounts)
      const accountPatterns = await this.extractAccountPatterns(userId);

      const identifiers: UserIdentifiers = {
        userId: user.id,
        email: user.email,
        name: user.name,
        normalizedEmail: user.email.toLowerCase(),
        normalizedName: user.name?.toLowerCase() || null,
        accountPatterns,
      };

      this.identifierCache.set(userId, identifiers);
      return identifiers;
    } catch (error) {
      logger.error('Failed to load user identifiers', {
        event: 'CROSS_USER_LOAD_ERROR',
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.createEmptyIdentifiers(userId);
    }
  }

  /**
   * Extract account number patterns associated with a user from their expense data
   */
  private async extractAccountPatterns(userId: string): Promise<string[]> {
    const prisma = getPrismaClient();

    try {
      // Look for ACCT-X-XXX or LOAN-X-XXX patterns in expense notes/merchants
      const expenses = await prisma.expense.findMany({
        where: { userId },
        select: { notes: true, merchant: true },
        take: 100, // Limit for performance
      });

      const patterns: Set<string> = new Set();
      const accountRegex = /\b(ACCT|LOAN)-[A-Z]-\d{3,6}\b/gi;

      for (const expense of expenses) {
        if (expense.notes) {
          const matches = expense.notes.match(accountRegex);
          if (matches) {
            matches.forEach((m) => patterns.add(m.toUpperCase()));
          }
        }
        if (expense.merchant) {
          const matches = expense.merchant.match(accountRegex);
          if (matches) {
            matches.forEach((m) => patterns.add(m.toUpperCase()));
          }
        }
      }

      return Array.from(patterns);
    } catch {
      return [];
    }
  }

  /**
   * Load map of all user emails for cross-referencing
   * This allows us to identify which user a detected email belongs to
   */
  private async loadAllUsersEmailMap(): Promise<Map<string, string>> {
    // Check cache
    if (
      this.allUsersEmailCache &&
      Date.now() < this.allUsersEmailCacheExpires
    ) {
      return this.allUsersEmailCache;
    }

    const prisma = getPrismaClient();

    try {
      const users = await prisma.user.findMany({
        select: { id: true, email: true },
      });

      const emailMap = new Map<string, string>();
      for (const user of users) {
        emailMap.set(user.email.toLowerCase(), user.id);
      }

      this.allUsersEmailCache = emailMap;
      this.allUsersEmailCacheExpires = Date.now() + this.allUsersCacheTtlMs;

      return emailMap;
    } catch (error) {
      logger.error('Failed to load all users email map', {
        event: 'CROSS_USER_EMAIL_MAP_ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
      return new Map();
    }
  }

  /**
   * Classify a PII match as belonging to current user, other user, or unknown
   */
  private classifyPII(
    piiMatch: PIIMatch,
    currentUser: UserIdentifiers,
    emailToUserMap: Map<string, string>
  ): CrossUserMatch {
    // Check by PII type
    switch (piiMatch.type) {
      case PIIType.EMAIL:
        return this.classifyEmail(piiMatch, currentUser, emailToUserMap);

      case PIIType.ACCOUNT_NUMBER:
      case PIIType.LOAN_NUMBER:
        return this.classifyAccountNumber(piiMatch, currentUser);

      case PIIType.SSN:
      case PIIType.CREDIT_CARD:
        // SSNs and credit cards should almost never appear in responses
        // If they do, they're suspicious unless we can verify ownership
        return this.classifyHighRiskPII(piiMatch, currentUser);

      case PIIType.PHONE:
        // Phone numbers are less critical but still worth flagging if unknown
        return this.classifyPhoneNumber(piiMatch, currentUser);

      default:
        return {
          type: piiMatch.type,
          value: piiMatch.value,
          start: piiMatch.start,
          end: piiMatch.end,
          belongsTo: 'UNKNOWN',
          confidence: 'LOW',
        };
    }
  }

  /**
   * Classify an email address
   */
  private classifyEmail(
    piiMatch: PIIMatch,
    currentUser: UserIdentifiers,
    emailToUserMap: Map<string, string>
  ): CrossUserMatch {
    const normalizedEmail = piiMatch.value.toLowerCase().trim();

    // Check if it's the current user's email
    if (normalizedEmail === currentUser.normalizedEmail) {
      return {
        type: piiMatch.type,
        value: piiMatch.value,
        start: piiMatch.start,
        end: piiMatch.end,
        belongsTo: 'CURRENT_USER',
        confidence: 'HIGH',
      };
    }

    // Check if it belongs to another known user
    const ownerUserId = emailToUserMap.get(normalizedEmail);
    if (ownerUserId) {
      return {
        type: piiMatch.type,
        value: piiMatch.value,
        start: piiMatch.start,
        end: piiMatch.end,
        belongsTo: 'OTHER_USER',
        suspectedUserId: ownerUserId,
        confidence: 'HIGH',
      };
    }

    // Unknown email - could be external or unregistered
    return {
      type: piiMatch.type,
      value: piiMatch.value,
      start: piiMatch.start,
      end: piiMatch.end,
      belongsTo: 'UNKNOWN',
      confidence: 'MEDIUM',
    };
  }

  /**
   * Classify an account or loan number
   */
  private classifyAccountNumber(
    piiMatch: PIIMatch,
    currentUser: UserIdentifiers
  ): CrossUserMatch {
    const normalizedAccount = piiMatch.value.toUpperCase();

    // Check if it's one of the current user's known accounts
    if (currentUser.accountPatterns.includes(normalizedAccount)) {
      return {
        type: piiMatch.type,
        value: piiMatch.value,
        start: piiMatch.start,
        end: piiMatch.end,
        belongsTo: 'CURRENT_USER',
        confidence: 'HIGH',
      };
    }

    // Account numbers we don't recognize - treat as suspicious
    return {
      type: piiMatch.type,
      value: piiMatch.value,
      start: piiMatch.start,
      end: piiMatch.end,
      belongsTo: 'UNKNOWN',
      confidence: 'MEDIUM',
    };
  }

  /**
   * Classify high-risk PII (SSN, credit card)
   */
  private classifyHighRiskPII(
    piiMatch: PIIMatch,
    _currentUser: UserIdentifiers
  ): CrossUserMatch {
    // SSNs and credit cards should never appear in LLM responses
    // Any detection is suspicious
    return {
      type: piiMatch.type,
      value: piiMatch.value,
      start: piiMatch.start,
      end: piiMatch.end,
      belongsTo: 'UNKNOWN',
      confidence: 'HIGH', // High confidence this is problematic
    };
  }

  /**
   * Classify a phone number
   */
  private classifyPhoneNumber(
    piiMatch: PIIMatch,
    _currentUser: UserIdentifiers
  ): CrossUserMatch {
    // We don't typically store phone numbers, so any detection is unknown
    return {
      type: piiMatch.type,
      value: piiMatch.value,
      start: piiMatch.start,
      end: piiMatch.end,
      belongsTo: 'UNKNOWN',
      confidence: 'LOW',
    };
  }

  /**
   * Create empty identifiers for unknown/error cases
   */
  private createEmptyIdentifiers(userId: string): UserIdentifiers {
    return {
      userId,
      email: '',
      name: null,
      normalizedEmail: '',
      normalizedName: null,
      accountPatterns: [],
    };
  }

  /**
   * Invalidate cache for a specific user
   * Call this when user data is updated
   */
  invalidateUserCache(userId: string): void {
    this.identifierCache.invalidate(userId);
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.identifierCache.clear();
    this.allUsersEmailCache = null;
    this.allUsersEmailCacheExpires = 0;
  }
}

// Export singleton instance
export const crossUserDetector = new CrossUserDetectorService();
