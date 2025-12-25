/**
 * PII Detector Service
 *
 * Detects personally identifiable information (PII) in text using
 * configurable pattern matching with confidence scoring.
 *
 * Supported PII types:
 * - SSN (Social Security Numbers)
 * - Account Numbers
 * - Loan Numbers
 * - Credit Cards (with Luhn validation)
 * - Email Addresses
 * - Phone Numbers
 *
 * Features:
 * - Configurable patterns via pii-patterns.yaml
 * - Confidence scoring (HIGH, MEDIUM, LOW)
 * - False positive reduction (date exclusion, SSN validation)
 * - Position tracking for redaction
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import logger from '../../config/logger';

/**
 * Types of PII that can be detected
 */
export enum PIIType {
  SSN = 'SSN',
  ACCOUNT_NUMBER = 'ACCOUNT_NUMBER',
  LOAN_NUMBER = 'LOAN_NUMBER',
  CREDIT_CARD = 'CREDIT_CARD',
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
}

/**
 * Confidence levels for PII matches
 */
export enum PIIConfidence {
  HIGH = 'HIGH', // Exact format match + validation
  MEDIUM = 'MEDIUM', // Format match, no validation
  LOW = 'LOW', // Fuzzy/contextual match
}

/**
 * A detected PII match
 */
export interface PIIMatch {
  type: PIIType;
  value: string;
  start: number;
  end: number;
  confidence: PIIConfidence;
  patternId: string;
  patternName: string;
}

/**
 * Pattern definition from config
 */
interface PatternDef {
  id: string;
  name: string;
  pattern: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  validation?: string;
}

/**
 * Category definition from config
 */
interface CategoryConfig {
  enabled: boolean;
  description: string;
  patterns: PatternDef[];
  exclusions?: Array<{ pattern: string; reason: string }>;
  invalid_prefixes?: string[];
  card_prefixes?: Record<string, string[]>;
}

/**
 * Full config file structure
 */
interface PIIPatternConfig {
  version: string;
  description: string;
  settings: {
    case_sensitive: boolean;
    max_matches_per_type: number;
    enable_validation: boolean;
  };
  categories: {
    ssn: CategoryConfig;
    account_number: CategoryConfig;
    loan_number: CategoryConfig;
    credit_card: CategoryConfig;
    email: CategoryConfig;
    phone: CategoryConfig;
  };
}

/**
 * Compiled pattern for efficient matching
 */
interface CompiledPIIPattern {
  id: string;
  name: string;
  type: PIIType;
  regex: RegExp;
  confidence: PIIConfidence;
  validation?: string;
}

/**
 * PII Detector Service
 */
export class PIIDetectorService {
  private patterns: CompiledPIIPattern[] = [];
  private exclusionPatterns: Map<PIIType, RegExp[]> = new Map();
  private invalidSSNPrefixes: Set<string> = new Set();
  private config: PIIPatternConfig | null = null;
  private configPath: string;
  private initialized = false;

  constructor(configPath?: string) {
    this.configPath =
      configPath ||
      path.join(__dirname, '../../../config/pii-patterns.yaml');
  }

  /**
   * Initialize the service by loading configuration
   */
  private initialize(): void {
    if (this.initialized) return;

    try {
      this.loadConfig();
      this.compilePatterns();
      this.initialized = true;
      logger.info('PII Detector Service initialized', {
        event: 'PII_DETECTOR_INIT',
        patternCount: this.patterns.length,
      });
    } catch (error) {
      logger.error('Failed to initialize PII Detector Service', {
        event: 'PII_DETECTOR_INIT_ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
      // Use fallback patterns if config fails to load
      this.loadFallbackPatterns();
      this.initialized = true;
    }
  }

  /**
   * Load configuration from YAML file
   */
  private loadConfig(): void {
    const configContent = fs.readFileSync(this.configPath, 'utf8');
    this.config = yaml.load(configContent) as PIIPatternConfig;
  }

  /**
   * Compile patterns from configuration
   */
  private compilePatterns(): void {
    if (!this.config) return;

    const categoryToType: Record<string, PIIType> = {
      ssn: PIIType.SSN,
      account_number: PIIType.ACCOUNT_NUMBER,
      loan_number: PIIType.LOAN_NUMBER,
      credit_card: PIIType.CREDIT_CARD,
      email: PIIType.EMAIL,
      phone: PIIType.PHONE,
    };

    for (const [categoryKey, category] of Object.entries(
      this.config.categories
    )) {
      if (!category.enabled) continue;

      const piiType = categoryToType[categoryKey];
      if (!piiType) continue;

      // Compile main patterns
      for (const patternDef of category.patterns) {
        try {
          const flags = this.config.settings.case_sensitive ? 'g' : 'gi';
          const regex = new RegExp(patternDef.pattern, flags);

          const compiled: CompiledPIIPattern = {
            id: patternDef.id,
            name: patternDef.name,
            type: piiType,
            regex,
            confidence: PIIConfidence[patternDef.confidence],
          };
          if (patternDef.validation) {
            compiled.validation = patternDef.validation;
          }
          this.patterns.push(compiled);
        } catch (error) {
          logger.warn('Failed to compile PII pattern', {
            event: 'PII_PATTERN_COMPILE_ERROR',
            patternId: patternDef.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Compile exclusion patterns
      if (category.exclusions) {
        const exclusions: RegExp[] = [];
        for (const exclusion of category.exclusions) {
          try {
            exclusions.push(new RegExp(exclusion.pattern, 'gi'));
          } catch {
            // Skip invalid exclusion patterns
          }
        }
        if (exclusions.length > 0) {
          this.exclusionPatterns.set(piiType, exclusions);
        }
      }

      // Load invalid SSN prefixes
      if (categoryKey === 'ssn' && category.invalid_prefixes) {
        for (const prefix of category.invalid_prefixes) {
          this.invalidSSNPrefixes.add(prefix);
        }
      }
    }
  }

  /**
   * Load fallback patterns if config fails
   */
  private loadFallbackPatterns(): void {
    this.patterns = [
      // SSN patterns
      {
        id: 'SSN001',
        name: 'Full SSN',
        type: PIIType.SSN,
        regex: /\b\d{3}-\d{2}-\d{4}\b/gi,
        confidence: PIIConfidence.HIGH,
      },
      // Credit card
      {
        id: 'CC001',
        name: 'Credit Card',
        type: PIIType.CREDIT_CARD,
        regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/gi,
        confidence: PIIConfidence.HIGH,
        validation: 'luhn',
      },
      // Email
      {
        id: 'EMAIL001',
        name: 'Email',
        type: PIIType.EMAIL,
        regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi,
        confidence: PIIConfidence.HIGH,
      },
      // Phone
      {
        id: 'PHONE001',
        name: 'Phone',
        type: PIIType.PHONE,
        regex: /\b(\(\d{3}\)\s*|\d{3}[-.])\d{3}[-.]?\d{4}\b/gi,
        confidence: PIIConfidence.HIGH,
      },
      // Account
      {
        id: 'ACCT001',
        name: 'Account',
        type: PIIType.ACCOUNT_NUMBER,
        regex: /\bACCT-[A-Z]-\d{3,6}\b/gi,
        confidence: PIIConfidence.HIGH,
      },
      // Loan
      {
        id: 'LOAN001',
        name: 'Loan',
        type: PIIType.LOAN_NUMBER,
        regex: /\bLOAN-[A-Z]-\d{3,6}\b/gi,
        confidence: PIIConfidence.HIGH,
      },
    ];
  }

  /**
   * Detect all PII in the given text
   */
  detectPII(text: string): PIIMatch[] {
    this.initialize();

    const matches: PIIMatch[] = [];
    const maxMatchesPerType = this.config?.settings.max_matches_per_type || 100;
    const matchCountByType = new Map<PIIType, number>();

    for (const pattern of this.patterns) {
      // Check if we've hit the max for this type
      const currentCount = matchCountByType.get(pattern.type) || 0;
      if (currentCount >= maxMatchesPerType) continue;

      // Reset regex lastIndex for global patterns
      pattern.regex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(text)) !== null) {
        const matchedValue = match[0];
        const start = match.index;
        const end = start + matchedValue.length;

        // Skip if excluded
        if (this.isExcluded(matchedValue, start, end, text, pattern.type)) {
          continue;
        }

        // Validate if required
        let confidence = pattern.confidence;
        if (pattern.validation) {
          const validationResult = this.validate(
            matchedValue,
            pattern.validation,
            pattern.type
          );
          if (!validationResult.valid) continue;
          if (validationResult.adjustedConfidence) {
            confidence = validationResult.adjustedConfidence;
          }
        }

        matches.push({
          type: pattern.type,
          value: matchedValue,
          start,
          end,
          confidence,
          patternId: pattern.id,
          patternName: pattern.name,
        });

        matchCountByType.set(pattern.type, currentCount + 1);
        if (currentCount + 1 >= maxMatchesPerType) break;
      }
    }

    // Deduplicate overlapping matches (keep highest confidence)
    const deduplicated = this.deduplicateMatches(matches);

    // Sort by position
    return deduplicated.sort((a, b) => a.start - b.start);
  }

  /**
   * Detect PII of specific types only
   */
  detectPIIByType(text: string, types: PIIType[]): PIIMatch[] {
    const allMatches = this.detectPII(text);
    return allMatches.filter((match) => types.includes(match.type));
  }

  /**
   * Check if a match should be excluded (false positive)
   */
  private isExcluded(
    value: string,
    start: number,
    end: number,
    text: string,
    type: PIIType
  ): boolean {
    // Check exclusion patterns
    const exclusions = this.exclusionPatterns.get(type);
    if (exclusions) {
      for (const exclusionRegex of exclusions) {
        exclusionRegex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = exclusionRegex.exec(text)) !== null) {
          const exStart = match.index;
          const exEnd = exStart + match[0].length;
          // Check if the exclusion overlaps with our match
          if (start >= exStart && end <= exEnd) {
            return true;
          }
        }
      }
    }

    // SSN-specific exclusions
    if (type === PIIType.SSN) {
      // Check for invalid prefixes
      const digitsOnly = value.replace(/\D/g, '');
      if (digitsOnly.length >= 3) {
        const prefix = digitsOnly.substring(0, 3);
        if (this.invalidSSNPrefixes.has(prefix)) {
          return true;
        }
        // Also check 9XX prefixes
        if (prefix.startsWith('9')) {
          return true;
        }
      }

      // Check context for date-related words
      const contextStart = Math.max(0, start - 20);
      const contextEnd = Math.min(text.length, end + 10);
      const context = text.substring(contextStart, contextEnd).toLowerCase();
      const dateKeywords = [
        'date',
        'born',
        'birthday',
        'dob',
        'year',
        'month',
        'day',
      ];
      for (const keyword of dateKeywords) {
        if (context.includes(keyword)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Validate a matched value
   */
  private validate(
    value: string,
    validationType: string,
    _type: PIIType
  ): { valid: boolean; adjustedConfidence?: PIIConfidence } {
    switch (validationType) {
      case 'luhn':
        return this.validateLuhn(value);
      case 'ssn_checksum':
        return this.validateSSN(value);
      default:
        return { valid: true };
    }
  }

  /**
   * Luhn algorithm for credit card validation
   */
  private validateLuhn(value: string): {
    valid: boolean;
    adjustedConfidence?: PIIConfidence;
  } {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) {
      return { valid: false };
    }

    let sum = 0;
    let isEven = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i] as string, 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    const valid = sum % 10 === 0;
    if (valid) {
      return { valid: true, adjustedConfidence: PIIConfidence.HIGH };
    }
    return { valid: false };
  }

  /**
   * SSN validation (basic structure check)
   */
  private validateSSN(value: string): {
    valid: boolean;
    adjustedConfidence?: PIIConfidence;
  } {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 9) {
      return { valid: false };
    }

    // Area number (first 3 digits) cannot be 000, 666, or 900-999
    const area = parseInt(digits.substring(0, 3), 10);
    if (area === 0 || area === 666 || area >= 900) {
      return { valid: false };
    }

    // Group number (middle 2 digits) cannot be 00
    const group = parseInt(digits.substring(3, 5), 10);
    if (group === 0) {
      return { valid: false };
    }

    // Serial number (last 4 digits) cannot be 0000
    const serial = parseInt(digits.substring(5, 9), 10);
    if (serial === 0) {
      return { valid: false };
    }

    return { valid: true, adjustedConfidence: PIIConfidence.MEDIUM };
  }

  /**
   * Remove overlapping matches, keeping highest confidence
   */
  private deduplicateMatches(matches: PIIMatch[]): PIIMatch[] {
    if (matches.length <= 1) return matches;

    // Sort by start position, then by confidence (HIGH first)
    const sorted = [...matches].sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      const confOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return confOrder[a.confidence] - confOrder[b.confidence];
    });

    const result: PIIMatch[] = [];
    let lastEnd = -1;

    for (const match of sorted) {
      // If this match doesn't overlap with the previous, add it
      if (match.start >= lastEnd) {
        result.push(match);
        lastEnd = match.end;
      }
      // If it overlaps but extends further, we skip it (keeping the earlier higher-confidence match)
    }

    return result;
  }

  /**
   * Get summary of detection capabilities
   */
  getCapabilities(): {
    types: PIIType[];
    patternCount: number;
    version: string;
  } {
    this.initialize();
    return {
      types: [
        PIIType.SSN,
        PIIType.ACCOUNT_NUMBER,
        PIIType.LOAN_NUMBER,
        PIIType.CREDIT_CARD,
        PIIType.EMAIL,
        PIIType.PHONE,
      ],
      patternCount: this.patterns.length,
      version: this.config?.version || '1.0',
    };
  }

  /**
   * Check if a specific PII type is enabled
   */
  isTypeEnabled(type: PIIType): boolean {
    this.initialize();
    return this.patterns.some((p) => p.type === type);
  }
}

// Export singleton instance
export const piiDetector = new PIIDetectorService();
