/**
 * List Checker Service
 *
 * Checks input against configurable allow and block lists.
 * Allow list is checked first (immediate ALLOW if match).
 * Block list is checked second (immediate BLOCK if match).
 *
 * List entries support:
 * - Exact match (case-insensitive substring)
 * - Regex match (full regex pattern)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import logger from '../../config/logger';
import {
  ListCheckResult,
  ListEntry,
  ListConfigFile,
  InspectionDecision,
} from './types';

// Zod schemas for configuration validation
const ListEntrySchema = z.object({
  id: z.string(),
  pattern: z.string(),
  type: z.enum(['exact', 'regex']),
  reason: z.string(),
  added_by: z.string(),
  added_at: z.string(),
});

const ListConfigFileSchema = z.object({
  version: z.string(),
  description: z.string(),
  allow_list: z.array(ListEntrySchema),
  block_list: z.array(ListEntrySchema),
});

/**
 * Compiled list entry with pre-compiled regex
 */
interface CompiledListEntry extends ListEntry {
  regex?: RegExp;
}

/**
 * ListCheckerService - Checks input against allow/block lists
 *
 * Loads configuration from YAML and provides fast matching.
 * Allow list takes precedence over block list.
 */
export class ListCheckerService {
  private allowList: CompiledListEntry[] = [];
  private blockList: CompiledListEntry[] = [];
  private configPath: string;
  private loaded = false;

  constructor(configPath?: string) {
    this.configPath =
      configPath || path.join(process.cwd(), 'config', 'allow-block-lists.yaml');
  }

  /**
   * Load lists from configuration file
   */
  private loadLists(): void {
    if (this.loaded) return;

    try {
      const configContent = fs.readFileSync(this.configPath, 'utf-8');
      const rawConfig = yaml.load(configContent);
      const config = ListConfigFileSchema.parse(rawConfig) as ListConfigFile;

      // Compile allow list
      this.allowList = (config.allow_list || []).map((entry) =>
        this.compileEntry(entry)
      );

      // Compile block list
      this.blockList = (config.block_list || []).map((entry) =>
        this.compileEntry(entry)
      );

      this.loaded = true;

      logger.info('Loaded allow/block lists', {
        allowCount: this.allowList.length,
        blockCount: this.blockList.length,
      });
    } catch (error) {
      logger.error('Failed to load allow/block lists', {
        configPath: this.configPath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Initialize with empty lists - fail open for list checking
      // Pattern matching and anomaly scoring will still provide protection
      this.allowList = [];
      this.blockList = [];
      this.loaded = true;
    }
  }

  /**
   * Compile a list entry (pre-compile regex if needed)
   */
  private compileEntry(entry: ListEntry): CompiledListEntry {
    if (entry.type === 'regex') {
      try {
        return {
          ...entry,
          regex: new RegExp(entry.pattern, 'i'),
        };
      } catch (regexError) {
        logger.error(`Invalid regex in list entry ${entry.id}`, {
          pattern: entry.pattern,
          error: regexError instanceof Error ? regexError.message : 'Unknown error',
        });
        // Return entry without compiled regex - will be skipped during matching
        return entry;
      }
    }
    return entry;
  }

  /**
   * Check input against allow and block lists
   *
   * Order of checking:
   * 1. Allow list (if match, return ALLOW immediately)
   * 2. Block list (if match, return BLOCK)
   * 3. No match (return { match: false })
   *
   * @param input - The input text to check
   * @returns ListCheckResult with match status and decision
   */
  check(input: string): ListCheckResult {
    if (!this.loaded) {
      this.loadLists();
    }

    const lowerInput = input.toLowerCase();

    // Check allow list FIRST
    for (const entry of this.allowList) {
      if (this.matchEntry(lowerInput, entry)) {
        logger.debug('Allow list match', {
          event: 'ALLOW_LIST_MATCH',
          listId: entry.id,
          reason: entry.reason,
        });
        return {
          match: true,
          decision: 'ALLOW' as InspectionDecision,
          listId: entry.id,
          listType: 'allow',
          reason: entry.reason,
        };
      }
    }

    // Check block list SECOND
    for (const entry of this.blockList) {
      if (this.matchEntry(lowerInput, entry)) {
        logger.warn('Block list match', {
          event: 'BLOCK_LIST_MATCH',
          listId: entry.id,
          reason: entry.reason,
        });
        return {
          match: true,
          decision: 'BLOCK' as InspectionDecision,
          listId: entry.id,
          listType: 'block',
          reason: entry.reason,
        };
      }
    }

    // No match
    return { match: false };
  }

  /**
   * Check if input matches a list entry
   */
  private matchEntry(input: string, entry: CompiledListEntry): boolean {
    if (entry.type === 'exact') {
      // Case-insensitive substring match
      return input.includes(entry.pattern.toLowerCase());
    } else if (entry.type === 'regex' && entry.regex) {
      // Regex match
      return entry.regex.test(input);
    }
    return false;
  }

  /**
   * Get list statistics
   */
  getStats(): { allowCount: number; blockCount: number } {
    if (!this.loaded) {
      this.loadLists();
    }
    return {
      allowCount: this.allowList.length,
      blockCount: this.blockList.length,
    };
  }

  /**
   * Reload lists from configuration
   */
  reload(): void {
    this.loaded = false;
    this.allowList = [];
    this.blockList = [];
    this.loadLists();
  }

  /**
   * Test input against lists (for CLI tool)
   */
  testInput(input: string): {
    match: boolean;
    listType?: 'allow' | 'block';
    listId?: string;
    reason?: string;
  } {
    const result = this.check(input);
    if (result.match && result.listType && result.listId && result.reason) {
      return {
        match: true,
        listType: result.listType,
        listId: result.listId,
        reason: result.reason,
      };
    }
    return { match: false };
  }
}

// Export singleton instance
export const listChecker = new ListCheckerService();
