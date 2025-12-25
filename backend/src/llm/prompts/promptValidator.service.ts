/**
 * PromptValidator Service
 *
 * Provides hash-based integrity verification for system prompts.
 * Uses SHA-256 hashing to detect tampering with prompt content.
 *
 * Security Features:
 * - SHA-256 cryptographic hashing
 * - Batch verification at startup
 * - Security event logging on integrity failures
 * - Continues operation but generates critical alerts
 */

import crypto from 'crypto';
import { PrismaClient, SystemPrompt } from '../../generated/prisma';
import logger from '../../config/logger';

/**
 * Result of verifying a single prompt
 */
export interface SingleVerificationResult {
  promptName: string;
  valid: boolean;
  expectedHash: string;
  actualHash: string;
}

/**
 * Result of verifying multiple prompts
 */
export interface VerificationResult {
  valid: boolean;
  totalChecked: number;
  passed: number;
  failed: number;
  failures: SingleVerificationResult[];
}

/**
 * Compute SHA-256 hash of prompt content
 * @param content - The prompt content to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function computePromptHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Verify integrity of a single prompt by comparing computed hash with stored hash
 * @param prompt - The SystemPrompt to verify
 * @returns true if integrity verified, false if tampered
 */
export function verifyPromptIntegrity(prompt: SystemPrompt): boolean {
  const computedHash = computePromptHash(prompt.content);
  return computedHash === prompt.contentHash;
}

/**
 * Verify integrity of multiple prompts
 * @param prompts - Array of SystemPrompt to verify
 * @returns VerificationResult with details on all checks
 */
export function verifyAllPrompts(prompts: SystemPrompt[]): VerificationResult {
  const failures: SingleVerificationResult[] = [];
  let passed = 0;

  for (const prompt of prompts) {
    const actualHash = computePromptHash(prompt.content);
    const isValid = actualHash === prompt.contentHash;

    if (isValid) {
      passed++;
    } else {
      failures.push({
        promptName: prompt.name,
        valid: false,
        expectedHash: prompt.contentHash,
        actualHash: actualHash,
      });
    }
  }

  return {
    valid: failures.length === 0,
    totalChecked: prompts.length,
    passed,
    failed: failures.length,
    failures,
  };
}

/**
 * PromptValidatorService - Singleton service for prompt integrity verification
 */
export class PromptValidatorService {
  private static instance: PromptValidatorService;
  private prisma: PrismaClient;

  private constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get the singleton instance of PromptValidatorService
   * @param prisma - Prisma client instance (required on first call)
   */
  public static getInstance(prisma?: PrismaClient): PromptValidatorService {
    if (!PromptValidatorService.instance) {
      if (!prisma) {
        throw new Error('Prisma client required for first initialization of PromptValidatorService');
      }
      PromptValidatorService.instance = new PromptValidatorService(prisma);
    }
    return PromptValidatorService.instance;
  }

  /**
   * Reset the singleton instance (for testing purposes only)
   */
  public static resetInstance(): void {
    PromptValidatorService.instance = undefined as unknown as PromptValidatorService;
  }

  /**
   * Verify integrity of all active prompts and handle failures
   * @param prompts - Array of prompts to verify
   * @returns VerificationResult
   */
  public async verifyAndHandle(prompts: SystemPrompt[]): Promise<VerificationResult> {
    const result = verifyAllPrompts(prompts);

    if (!result.valid) {
      await this.handleIntegrityFailures(result.failures);
    } else {
      logger.info('Prompt integrity verification passed', {
        totalChecked: result.totalChecked,
        passed: result.passed,
      });
    }

    return result;
  }

  /**
   * Handle integrity failures - log security events and generate alerts
   * @param failures - Array of failed verification results
   */
  private async handleIntegrityFailures(failures: SingleVerificationResult[]): Promise<void> {
    // Log CRITICAL level message
    logger.error('CRITICAL: Prompt integrity verification failed', {
      event: 'PROMPT_INTEGRITY_FAILURE',
      level: 'critical',
      failedCount: failures.length,
      promptNames: failures.map((f) => f.promptName),
    });

    // Create security events for each failure
    for (const failure of failures) {
      try {
        await this.prisma.securityEvent.create({
          data: {
            eventType: 'PROMPT_INTEGRITY_FAILURE',
            severity: 'CRITICAL',
            details: {
              promptName: failure.promptName,
              expectedHash: failure.expectedHash,
              // NOTE: Never log actual content or computed hash in security event
              // to prevent information leakage
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
   * Verify a single prompt's integrity
   * @param prompt - The SystemPrompt to verify
   * @returns true if verified, false if tampered
   */
  public verifySingle(prompt: SystemPrompt): boolean {
    return verifyPromptIntegrity(prompt);
  }

  /**
   * Compute hash for new prompt content
   * @param content - The prompt content to hash
   * @returns SHA-256 hex hash
   */
  public computeHash(content: string): string {
    return computePromptHash(content);
  }
}
