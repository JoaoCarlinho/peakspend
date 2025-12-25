/**
 * Session Tracker Service
 *
 * Tracks user behavior patterns across requests within a session.
 * Provides sliding window metrics for anomaly detection.
 *
 * Features:
 * - In-memory session storage with LRU eviction
 * - Sliding window for time-based event tracking
 * - Session expiration after inactivity
 * - Configurable thresholds
 *
 * Usage:
 *   import { sessionTracker } from '@/security';
 *
 *   // Track a request
 *   sessionTracker.trackRequest(sessionId, userId, 0.3, 'ALLOW');
 *
 *   // Check if session is suspicious
 *   const isSuspicious = sessionTracker.isSessionSuspicious(sessionId);
 */

import { LRUCache } from 'lru-cache';
import { securityConfigService } from './securityConfig.service';
import logger from '../config/logger';

/**
 * Security decision types
 */
export type SecurityDecision = 'ALLOW' | 'BLOCK' | 'FLAG' | 'ESCALATE';

/**
 * Pattern category types for tracking different attack vectors
 */
export type PatternCategory =
  | 'SQL_INJECTION'
  | 'XSS'
  | 'PROMPT_INJECTION'
  | 'JAILBREAK'
  | 'PII_PROBE'
  | 'CROSS_USER_PROBE'
  | 'UNAUTHORIZED_TOOL'
  | 'RATE_LIMIT'
  | 'OTHER';

/**
 * Session metrics tracked over time
 */
export interface SessionMetrics {
  requestCount: number;
  blockedCount: number;
  flaggedCount: number;
  anomalyScores: number[]; // Rolling window of scores
  avgAnomalyScore: number;
  decisionHistory: SecurityDecision[];
  patternCategoriesTriggered: PatternCategory[];
  lastRequestAt: Date;
}

/**
 * Full session data including user context
 */
export interface SessionData {
  sessionId: string;
  userId: string;
  firstRequestAt: Date;
  lastRequestAt: Date;
  metrics: SessionMetrics;
}

/**
 * Configuration for session tracking
 */
export interface SessionTrackerConfig {
  windowSizeMs: number; // Default: 5 minutes (300000ms)
  sessionTtlMs: number; // Default: 30 minutes (1800000ms)
  maxSessions: number; // LRU limit
  cleanupIntervalMs: number; // Periodic cleanup interval
  suspiciousAvgScoreThreshold: number; // Threshold for suspicious session
  suspiciousBlockedCountThreshold: number; // Blocked requests threshold
  rapidRequestThreshold: number; // Requests per minute threshold
}

/**
 * Sliding window for time-based event tracking
 */
export class SlidingWindow {
  private events: Array<{ timestamp: number; value: number }> = [];
  private windowSizeMs: number;

  constructor(windowSizeMs: number) {
    this.windowSizeMs = windowSizeMs;
  }

  /**
   * Add an event to the window
   */
  add(value: number): void {
    this.events.push({ timestamp: Date.now(), value });
    this.prune();
  }

  /**
   * Remove events outside the window
   */
  prune(): void {
    const cutoff = Date.now() - this.windowSizeMs;
    this.events = this.events.filter((e) => e.timestamp > cutoff);
  }

  /**
   * Get count of events in window
   */
  getCount(): number {
    this.prune();
    return this.events.length;
  }

  /**
   * Get average value of events in window
   */
  getAverage(): number {
    this.prune();
    if (this.events.length === 0) return 0;
    const sum = this.events.reduce((acc, e) => acc + e.value, 0);
    return sum / this.events.length;
  }

  /**
   * Get all values in window (for trend analysis)
   */
  getValues(): number[] {
    this.prune();
    return this.events.map((e) => e.value);
  }

  /**
   * Get the trend direction (-1 decreasing, 0 stable, 1 increasing)
   */
  getTrend(): number {
    this.prune();
    if (this.events.length < 3) return 0;

    // Use linear regression to detect trend
    const n = this.events.length;
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;

    for (let i = 0; i < n; i++) {
      const event = this.events[i];
      if (event) {
        sumX += i;
        sumY += event.value;
        sumXY += i * event.value;
        sumX2 += i * i;
      }
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    if (slope > 0.01) return 1;
    if (slope < -0.01) return -1;
    return 0;
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
  }
}

/**
 * Internal session storage with sliding windows
 */
interface InternalSession {
  data: SessionData;
  anomalyWindow: SlidingWindow;
  requestWindow: SlidingWindow;
}

/**
 * Session Tracker Service
 *
 * Singleton service for tracking session-based patterns.
 */
export class SessionTrackerService {
  private static instance: SessionTrackerService | null = null;

  private sessions: LRUCache<string, InternalSession>;
  private config: SessionTrackerConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Default configuration
   */
  private static readonly DEFAULT_CONFIG: SessionTrackerConfig = {
    windowSizeMs: 5 * 60 * 1000, // 5 minutes
    sessionTtlMs: 30 * 60 * 1000, // 30 minutes
    maxSessions: 10000,
    cleanupIntervalMs: 60 * 1000, // 1 minute
    suspiciousAvgScoreThreshold: 0.5,
    suspiciousBlockedCountThreshold: 3,
    rapidRequestThreshold: 10, // requests per minute
  };

  private constructor(config?: Partial<SessionTrackerConfig>) {
    this.config = {
      ...SessionTrackerService.DEFAULT_CONFIG,
      ...config,
    };

    this.sessions = new LRUCache<string, InternalSession>({
      max: this.config.maxSessions,
      ttl: this.config.sessionTtlMs,
      ttlAutopurge: true,
      updateAgeOnGet: true, // Reset TTL on access
    });

    this.startCleanupInterval();

    logger.info('SessionTrackerService initialized', {
      event: 'SESSION_TRACKER_INIT',
      config: {
        windowSizeMs: this.config.windowSizeMs,
        sessionTtlMs: this.config.sessionTtlMs,
        maxSessions: this.config.maxSessions,
      },
    });
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<SessionTrackerConfig>): SessionTrackerService {
    if (!SessionTrackerService.instance) {
      SessionTrackerService.instance = new SessionTrackerService(config);
    }
    return SessionTrackerService.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    if (SessionTrackerService.instance) {
      SessionTrackerService.instance.destroy();
      SessionTrackerService.instance = null;
    }
  }

  /**
   * Track a request for a session
   */
  public trackRequest(
    sessionId: string,
    userId: string,
    anomalyScore: number,
    decision: SecurityDecision,
    patternCategory?: PatternCategory
  ): void {
    // Check if anomaly detection is enabled
    if (!securityConfigService.isFeatureEnabled('ANOMALY_DETECTION_ENABLED')) {
      return;
    }

    const session = this.getOrCreateSession(sessionId, userId);
    this.updateMetrics(session, anomalyScore, decision, patternCategory);

    logger.debug('Request tracked', {
      event: 'SESSION_REQUEST_TRACKED',
      sessionId,
      userId,
      anomalyScore,
      decision,
      patternCategory,
      requestCount: session.data.metrics.requestCount,
    });
  }

  /**
   * Get metrics for a session
   */
  public getSessionMetrics(sessionId: string): SessionMetrics | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Update averages before returning
    this.refreshMetrics(session);
    return { ...session.data.metrics };
  }

  /**
   * Get full session data
   */
  public getSessionData(sessionId: string): SessionData | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    this.refreshMetrics(session);
    return { ...session.data };
  }

  /**
   * Check if a session is suspicious
   */
  public isSessionSuspicious(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.refreshMetrics(session);
    const metrics = session.data.metrics;

    // Check various suspicious conditions
    if (metrics.avgAnomalyScore > this.config.suspiciousAvgScoreThreshold) {
      return true;
    }

    if (metrics.blockedCount >= this.config.suspiciousBlockedCountThreshold) {
      return true;
    }

    if (this.detectRapidRequests(session)) {
      return true;
    }

    return false;
  }

  /**
   * Get request rate (requests per minute) for a session
   */
  public getRequestRate(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session) return 0;

    session.requestWindow.prune();
    const count = session.requestWindow.getCount();
    const windowMinutes = this.config.windowSizeMs / 60000;
    return count / windowMinutes;
  }

  /**
   * Get anomaly score trend for a session
   */
  public getAnomalyTrend(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session) return 0;

    return session.anomalyWindow.getTrend();
  }

  /**
   * Get recent anomaly scores for a session
   */
  public getRecentAnomalyScores(sessionId: string): number[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.anomalyWindow.getValues();
  }

  /**
   * Get unique pattern categories triggered in a session
   */
  public getUniquePatternCategories(sessionId: string): PatternCategory[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return [...new Set(session.data.metrics.patternCategoriesTriggered)];
  }

  /**
   * Get recent decisions for a session (for sequential analysis)
   */
  public getRecentDecisions(sessionId: string, count: number = 10): SecurityDecision[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.data.metrics.decisionHistory.slice(-count);
  }

  /**
   * Get active session count
   */
  public getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Clear all session data
   */
  public clearAllSessions(): void {
    this.sessions.clear();
    logger.info('All sessions cleared', { event: 'SESSION_TRACKER_CLEARED' });
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<SessionTrackerConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('SessionTracker config updated', {
      event: 'SESSION_TRACKER_CONFIG_UPDATED',
      config,
    });
  }

  /**
   * Destroy the service (cleanup resources)
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.sessions.clear();
    logger.info('SessionTrackerService destroyed', { event: 'SESSION_TRACKER_DESTROYED' });
  }

  /**
   * Get or create a session
   */
  private getOrCreateSession(sessionId: string, userId: string): InternalSession {
    let session = this.sessions.get(sessionId);

    if (!session) {
      const now = new Date();
      session = {
        data: {
          sessionId,
          userId,
          firstRequestAt: now,
          lastRequestAt: now,
          metrics: {
            requestCount: 0,
            blockedCount: 0,
            flaggedCount: 0,
            anomalyScores: [],
            avgAnomalyScore: 0,
            decisionHistory: [],
            patternCategoriesTriggered: [],
            lastRequestAt: now,
          },
        },
        anomalyWindow: new SlidingWindow(this.config.windowSizeMs),
        requestWindow: new SlidingWindow(this.config.windowSizeMs),
      };
      this.sessions.set(sessionId, session);

      logger.debug('New session created', {
        event: 'SESSION_CREATED',
        sessionId,
        userId,
      });
    }

    return session;
  }

  /**
   * Update metrics for a session
   */
  private updateMetrics(
    session: InternalSession,
    anomalyScore: number,
    decision: SecurityDecision,
    patternCategory?: PatternCategory
  ): void {
    const now = new Date();
    const metrics = session.data.metrics;

    // Update counts
    metrics.requestCount++;
    if (decision === 'BLOCK') {
      metrics.blockedCount++;
    }
    if (decision === 'FLAG') {
      metrics.flaggedCount++;
    }

    // Add to sliding windows
    session.anomalyWindow.add(anomalyScore);
    session.requestWindow.add(1);

    // Update decision history (keep last 50)
    metrics.decisionHistory.push(decision);
    if (metrics.decisionHistory.length > 50) {
      metrics.decisionHistory.shift();
    }

    // Update pattern categories
    if (patternCategory) {
      metrics.patternCategoriesTriggered.push(patternCategory);
      // Keep last 100 pattern triggers
      if (metrics.patternCategoriesTriggered.length > 100) {
        metrics.patternCategoriesTriggered.shift();
      }
    }

    // Update timestamps
    metrics.lastRequestAt = now;
    session.data.lastRequestAt = now;

    // Refresh computed metrics
    this.refreshMetrics(session);
  }

  /**
   * Refresh computed metrics (average score, etc.)
   */
  private refreshMetrics(session: InternalSession): void {
    const metrics = session.data.metrics;

    // Update average anomaly score from window
    metrics.avgAnomalyScore = session.anomalyWindow.getAverage();
    metrics.anomalyScores = session.anomalyWindow.getValues();
  }

  /**
   * Detect rapid requests in a session
   */
  private detectRapidRequests(session: InternalSession): boolean {
    session.requestWindow.prune();
    const requestsInWindow = session.requestWindow.getCount();
    const windowMinutes = this.config.windowSizeMs / 60000;
    const requestsPerMinute = requestsInWindow / windowMinutes;

    return requestsPerMinute > this.config.rapidRequestThreshold;
  }

  /**
   * Start periodic cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      // LRU cache handles TTL automatically, but we log stats
      logger.debug('Session tracker stats', {
        event: 'SESSION_TRACKER_STATS',
        activeSessions: this.sessions.size,
      });
    }, this.config.cleanupIntervalMs);

    // Don't prevent Node from exiting
    this.cleanupInterval.unref();
  }
}

// Export singleton instance
export const sessionTracker = SessionTrackerService.getInstance();
