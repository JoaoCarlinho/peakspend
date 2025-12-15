/**
 * PromptManager Service
 *
 * Manages system prompts loaded from the database with in-memory caching.
 * Implements singleton pattern for consistent access across modules.
 *
 * Features:
 * - Loads prompts from SystemPrompt table at startup
 * - Caches prompts in memory for fast retrieval
 * - Provides type-safe access to prompt content
 * - Integrates with hash verification for tamper detection
 */

import { PrismaClient, SystemPrompt } from '../../generated/prisma';
import logger from '../../config/logger';
import { verifyAllPrompts, VerificationResult } from './promptValidator.service';

/**
 * Error thrown when a requested prompt is not found in the cache
 */
export class PromptNotFoundError extends Error {
  public readonly promptName: string;

  constructor(promptName: string) {
    super(`Required prompt not found: ${promptName}`);
    this.name = 'PromptNotFoundError';
    this.promptName = promptName;
  }
}

/**
 * Error thrown when PromptManager is accessed before initialization
 */
export class PromptManagerNotInitializedError extends Error {
  constructor() {
    super('PromptManager has not been initialized. Call initialize() first.');
    this.name = 'PromptManagerNotInitializedError';
  }
}

/**
 * Data structure for prompt information (excludes content hash for external use)
 */
export interface SystemPromptData {
  id: string;
  name: string;
  version: number;
  content: string;
  isActive: boolean;
  createdAt: Date;
  createdBy: string | null;
}

/**
 * Verification result interface (used after hash verification integration)
 */
export interface PromptVerificationResult {
  valid: boolean;
  totalChecked: number;
  passed: number;
  failed: number;
  failures: Array<{
    promptName: string;
    expectedHash: string;
    actualHash: string;
  }>;
}

/**
 * PromptManagerService - Singleton service for managing system prompts
 */
export class PromptManagerService {
  private static instance: PromptManagerService;
  private cache: Map<string, SystemPrompt> = new Map();
  private initialized: boolean = false;
  private integrityVerified: boolean = false;
  private verificationResult: PromptVerificationResult | null = null;
  private prisma: PrismaClient;

  /**
   * Private constructor - use getInstance() to access the singleton
   */
  private constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get the singleton instance of PromptManagerService
   * @param prisma - Prisma client instance (required on first call)
   * @throws Error if prisma is not provided on first initialization
   */
  public static getInstance(prisma?: PrismaClient): PromptManagerService {
    if (!PromptManagerService.instance) {
      if (!prisma) {
        throw new Error('Prisma client required for first initialization of PromptManagerService');
      }
      PromptManagerService.instance = new PromptManagerService(prisma);
    }
    return PromptManagerService.instance;
  }

  /**
   * Reset the singleton instance (for testing purposes only)
   */
  public static resetInstance(): void {
    PromptManagerService.instance = undefined as unknown as PromptManagerService;
  }

  /**
   * Initialize the PromptManager by loading all active prompts from the database
   * Should be called once at application startup
   * @param skipVerification - If true, skip hash verification (for testing)
   */
  public async initialize(skipVerification: boolean = false): Promise<void> {
    if (this.initialized) {
      logger.warn('PromptManager already initialized, skipping re-initialization');
      return;
    }

    logger.info('Initializing PromptManager...');

    try {
      // Load all active prompts from database
      const prompts = await this.prisma.systemPrompt.findMany({
        where: { isActive: true },
      });

      // Verify prompt integrity before caching (Story 2.2)
      if (!skipVerification && prompts.length > 0) {
        logger.info('Verifying prompt integrity...');
        const verification = verifyAllPrompts(prompts);
        this.setVerificationResult(verification);

        if (!verification.valid) {
          // Log integrity failures and create security events
          await this.handleIntegrityFailures(verification);
          // Continue operation but with warning - don't crash the app
        } else {
          logger.info('Prompt integrity verification passed', {
            totalChecked: verification.totalChecked,
            passed: verification.passed,
          });
        }
      }

      // Clear existing cache and populate with new data
      // Cache all prompts even if some failed verification - let application decide
      this.cache.clear();
      prompts.forEach((prompt) => {
        this.cache.set(prompt.name, prompt);
      });

      this.initialized = true;

      logger.info(`PromptManager initialized with ${prompts.length} prompts`, {
        promptNames: prompts.map((p) => p.name),
      });

      // Log individual prompts at debug level
      if (prompts.length > 0) {
        logger.debug('Loaded prompts:', {
          prompts: prompts.map((p) => ({
            name: p.name,
            version: p.version,
            contentLength: p.content.length,
          })),
        });
      } else {
        logger.warn('No active prompts found in database. LLM features may not work correctly.');
      }
    } catch (error) {
      logger.error('Failed to initialize PromptManager', { error });
      throw error;
    }
  }

  /**
   * Handle integrity verification failures - log and create security events
   */
  private async handleIntegrityFailures(verification: VerificationResult): Promise<void> {
    // Log CRITICAL level message
    logger.error('CRITICAL: Prompt integrity verification failed', {
      event: 'PROMPT_INTEGRITY_FAILURE',
      level: 'critical',
      failedCount: verification.failed,
      promptNames: verification.failures.map((f) => f.promptName),
    });

    // Create security events for each failure
    for (const failure of verification.failures) {
      try {
        await this.prisma.securityEvent.create({
          data: {
            eventType: 'PROMPT_INTEGRITY_FAILURE',
            severity: 'CRITICAL',
            details: {
              promptName: failure.promptName,
              expectedHash: failure.expectedHash,
              // NOTE: Never log actual content or computed hash to prevent leakage
              message: `Prompt "${failure.promptName}" failed integrity verification`,
            },
            status: 'PENDING',
            alertSent: false,
            alertDestinations: ['security-team', 'ops-team'],
          },
        });

        logger.warn(`Security event created for prompt integrity failure: ${failure.promptName}`);
      } catch (error) {
        // Log but don't fail if security event creation fails
        logger.error('Failed to create security event for prompt integrity failure', {
          promptName: failure.promptName,
          error,
        });
      }
    }
  }

  /**
   * Get prompt content by name
   * @param name - The unique name of the prompt
   * @returns The prompt content string
   * @throws PromptManagerNotInitializedError if not initialized
   * @throws PromptNotFoundError if prompt doesn't exist
   */
  public getPrompt(name: string): string {
    if (!this.initialized) {
      throw new PromptManagerNotInitializedError();
    }

    const prompt = this.cache.get(name);
    if (!prompt) {
      logger.warn(`Prompt not found: ${name}`, {
        requestedPrompt: name,
        availablePrompts: Array.from(this.cache.keys()),
      });
      throw new PromptNotFoundError(name);
    }

    return prompt.content;
  }

  /**
   * Get the full SystemPrompt object by name
   * @param name - The unique name of the prompt
   * @returns The full SystemPrompt object
   * @throws PromptManagerNotInitializedError if not initialized
   * @throws PromptNotFoundError if prompt doesn't exist
   */
  public getPromptData(name: string): SystemPromptData {
    if (!this.initialized) {
      throw new PromptManagerNotInitializedError();
    }

    const prompt = this.cache.get(name);
    if (!prompt) {
      logger.warn(`Prompt not found: ${name}`);
      throw new PromptNotFoundError(name);
    }

    // Return without contentHash for external use
    return {
      id: prompt.id,
      name: prompt.name,
      version: prompt.version,
      content: prompt.content,
      isActive: prompt.isActive,
      createdAt: prompt.createdAt,
      createdBy: prompt.createdBy,
    };
  }

  /**
   * Get all cached prompts (defensive copy)
   * @returns Map of prompt name to SystemPrompt
   * @throws PromptManagerNotInitializedError if not initialized
   */
  public getAllPrompts(): Map<string, SystemPrompt> {
    if (!this.initialized) {
      throw new PromptManagerNotInitializedError();
    }

    return new Map(this.cache);
  }

  /**
   * Get list of all available prompt names
   * @returns Array of prompt names
   * @throws PromptManagerNotInitializedError if not initialized
   */
  public getPromptNames(): string[] {
    if (!this.initialized) {
      throw new PromptManagerNotInitializedError();
    }

    return Array.from(this.cache.keys());
  }

  /**
   * Check if a prompt exists in the cache
   * @param name - The prompt name to check
   * @returns true if prompt exists, false otherwise
   */
  public hasPrompt(name: string): boolean {
    if (!this.initialized) {
      return false;
    }
    return this.cache.has(name);
  }

  /**
   * Get the number of cached prompts
   * @returns Number of prompts in cache
   */
  public getPromptCount(): number {
    return this.cache.size;
  }

  /**
   * Check if the manager has been initialized
   * @returns true if initialized, false otherwise
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get integrity verification status
   * @returns true if all prompts passed hash verification
   */
  public isIntegrityVerified(): boolean {
    return this.integrityVerified;
  }

  /**
   * Set verification result (called by PromptValidator)
   * @param result - The verification result
   */
  public setVerificationResult(result: PromptVerificationResult): void {
    this.verificationResult = result;
    this.integrityVerified = result.valid;

    if (!result.valid) {
      logger.error('Prompt integrity verification failed', {
        failedCount: result.failed,
        failures: result.failures.map((f) => f.promptName),
      });
    }
  }

  /**
   * Get the last verification result
   * @returns The verification result or null if not verified
   */
  public getVerificationResult(): PromptVerificationResult | null {
    return this.verificationResult;
  }

  /**
   * Reload prompts from database (useful for runtime updates)
   * Note: Use with caution in production
   */
  public async reload(): Promise<void> {
    logger.info('Reloading PromptManager...');
    this.initialized = false;
    this.integrityVerified = false;
    this.verificationResult = null;
    await this.initialize();
  }

  /**
   * Get health status for monitoring
   * @returns Health status object
   */
  public getHealthStatus(): {
    initialized: boolean;
    integrityVerified: boolean;
    promptCount: number;
    promptNames: string[];
  } {
    return {
      initialized: this.initialized,
      integrityVerified: this.integrityVerified,
      promptCount: this.cache.size,
      promptNames: Array.from(this.cache.keys()),
    };
  }
}
