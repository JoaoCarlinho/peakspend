/**
 * LLM Prompts Module
 *
 * Exports for prompt management services including:
 * - PromptManagerService: Database-backed prompt loading with caching
 * - PromptValidatorService: Hash-based integrity verification
 *
 * Usage:
 *   import { getPromptManager, PromptNotFoundError, computePromptHash } from '@/llm/prompts';
 *
 *   // At startup (done automatically in server.ts)
 *   const promptManager = getPromptManager();
 *   await promptManager.initialize();
 *
 *   // Get prompt content
 *   const systemPrompt = promptManager.getPrompt('receipt_ocr');
 *
 *   // Compute hash for new prompt
 *   const hash = computePromptHash('prompt content');
 */

// PromptManager exports
export {
  PromptManagerService,
  PromptNotFoundError,
  PromptManagerNotInitializedError,
} from './promptManager.service';

export type {
  SystemPromptData,
  PromptVerificationResult,
} from './promptManager.service';

// PromptValidator exports (Story 2.2)
export {
  PromptValidatorService,
  computePromptHash,
  verifyPromptIntegrity,
  verifyAllPrompts,
} from './promptValidator.service';

export type {
  VerificationResult,
  SingleVerificationResult,
} from './promptValidator.service';

// Note: promptManager singleton will be created after application startup
// to ensure Prisma client is available. Use PromptManagerService.getInstance()
// with the Prisma client from database.ts

// Re-export SystemPrompt type from Prisma for convenience
export type { SystemPrompt } from '../../generated/prisma';

// Convenience re-export for getting instance
import { PromptManagerService } from './promptManager.service';
import { getPrismaClient } from '../../config/database';

/**
 * Get or create the PromptManager singleton instance
 * Uses the default Prisma client from database.ts
 */
export function getPromptManager(): PromptManagerService {
  return PromptManagerService.getInstance(getPrismaClient());
}
