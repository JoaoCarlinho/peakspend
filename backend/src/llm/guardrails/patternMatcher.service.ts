/**
 * Pattern Matcher Service
 *
 * Detects known prompt injection attack patterns in input text.
 * Patterns are loaded from a YAML configuration file and compiled
 * at startup for efficient matching.
 *
 * Pattern categories:
 * - DIRECT_OVERRIDE: Attempts to override/ignore instructions
 * - ROLE_HIJACK: Attempts to change AI role/persona
 * - DELIMITER_CONFUSION: Special chars/formats to confuse parsing
 * - PROMPT_EXTRACTION: Attempts to extract system prompts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import logger from '../../config/logger';
import {
  PatternMatch,
  PatternSeverity,
  CompiledPattern,
  PatternConfigFile,
} from './types';

// Zod schema for pattern configuration validation
const PatternSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

const PatternConfigSchema = z.object({
  id: z.string(),
  category: z.string(),
  name: z.string(),
  pattern: z.string(),
  flags: z.string().optional(),
  severity: PatternSeveritySchema,
  description: z.string(),
});

const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  severity: PatternSeveritySchema,
});

const PatternConfigFileSchema = z.object({
  version: z.string(),
  description: z.string(),
  categories: z.array(CategorySchema),
  patterns: z.array(PatternConfigSchema),
});

/**
 * PatternMatcherService - Detects known prompt injection patterns
 *
 * Loads patterns from YAML config and provides efficient regex matching.
 * All matches are case-insensitive by default.
 */
export class PatternMatcherService {
  private patterns: CompiledPattern[] = [];
  private configPath: string;
  private loaded = false;

  constructor(configPath?: string) {
    this.configPath =
      configPath ||
      path.join(process.cwd(), 'config', 'injection-patterns.yaml');
  }

  /**
   * Load and compile patterns from configuration file
   * Called lazily on first match() call
   */
  private loadPatterns(): void {
    if (this.loaded) return;

    try {
      // Read YAML configuration
      const configContent = fs.readFileSync(this.configPath, 'utf-8');
      const rawConfig = yaml.load(configContent);

      // Validate configuration
      const config = PatternConfigFileSchema.parse(rawConfig) as PatternConfigFile;

      // Compile patterns
      this.patterns = config.patterns.map((p) => {
        try {
          // Default to case-insensitive if no flags specified
          const flags = p.flags || 'i';
          // Add global flag for multiple matches
          const fullFlags = flags.includes('g') ? flags : flags + 'g';

          return {
            ...p,
            regex: new RegExp(p.pattern, fullFlags),
          };
        } catch (regexError) {
          logger.error(`Invalid regex pattern: ${p.id}`, {
            pattern: p.pattern,
            error: regexError instanceof Error ? regexError.message : 'Unknown error',
          });
          // Return pattern with a never-matching regex
          return {
            ...p,
            regex: /(?!)/g, // Regex that never matches
          };
        }
      });

      this.loaded = true;
      logger.info(`Loaded ${this.patterns.length} injection patterns from config`, {
        categories: [...new Set(this.patterns.map((p) => p.category))],
        patternCount: this.patterns.length,
      });
    } catch (error) {
      logger.error('Failed to load injection patterns', {
        configPath: this.configPath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Initialize with empty patterns - fail open for this component
      // The anomaly scorer will still provide protection
      this.patterns = [];
      this.loaded = true;
    }
  }

  /**
   * Match input against all patterns
   *
   * @param input - The input text to scan for patterns
   * @returns Array of pattern matches found
   */
  match(input: string): PatternMatch[] {
    // Ensure patterns are loaded
    if (!this.loaded) {
      this.loadPatterns();
    }

    const matches: PatternMatch[] = [];

    for (const pattern of this.patterns) {
      // Create a fresh regex instance for each pattern (to reset lastIndex)
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let regexMatch;

      while ((regexMatch = regex.exec(input)) !== null) {
        const matchObj: PatternMatch = {
          patternId: pattern.id,
          category: pattern.category,
          name: pattern.name,
          severity: pattern.severity as PatternSeverity,
          position: {
            start: regexMatch.index,
            end: regexMatch.index + regexMatch[0].length,
          },
          // Truncate matched text for logging (avoid logging full attack payloads)
          matchedText: regexMatch[0].substring(0, 50),
        };

        matches.push(matchObj);

        // Log the match (without full input for privacy)
        logger.debug('Pattern match detected', {
          event: 'PATTERN_MATCH',
          patternId: pattern.id,
          category: pattern.category,
          severity: pattern.severity,
          position: regexMatch.index,
          matchLength: regexMatch[0].length,
        });
      }
    }

    // Log summary if matches found
    if (matches.length > 0) {
      logger.info('Pattern matches found in input', {
        event: 'PATTERN_MATCHES_SUMMARY',
        totalMatches: matches.length,
        categories: [...new Set(matches.map((m) => m.category))],
        severities: [...new Set(matches.map((m) => m.severity))],
        patternIds: matches.map((m) => m.patternId),
      });
    }

    return matches;
  }

  /**
   * Get the number of loaded patterns
   */
  getPatternCount(): number {
    if (!this.loaded) {
      this.loadPatterns();
    }
    return this.patterns.length;
  }

  /**
   * Get pattern statistics by category
   */
  getPatternStats(): Record<string, number> {
    if (!this.loaded) {
      this.loadPatterns();
    }

    const stats: Record<string, number> = {};
    for (const pattern of this.patterns) {
      stats[pattern.category] = (stats[pattern.category] || 0) + 1;
    }
    return stats;
  }

  /**
   * Reload patterns from configuration file
   * Useful for runtime updates
   */
  reload(): void {
    this.loaded = false;
    this.patterns = [];
    this.loadPatterns();
  }
}

// Export singleton instance
export const patternMatcher = new PatternMatcherService();
