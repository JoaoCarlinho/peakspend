/**
 * PII Redactor Service
 *
 * Redacts personally identifiable information from text with configurable
 * confidence thresholds and format options.
 *
 * Features:
 * - Type-specific redaction formats ([REDACTED-SSN], [REDACTED-EMAIL], etc.)
 * - Confidence-based filtering (HIGH, MEDIUM, LOW)
 * - Partial redaction option (show last 4 digits)
 * - JSON structure preservation
 * - Redaction summary for audit
 */

import logger from '../../config/logger';
import {
  PIIDetectorService,
  piiDetector,
  PIIType,
  PIIConfidence,
  PIIMatch,
} from './piiDetector.service';

/**
 * Configuration for redaction behavior
 */
export interface RedactionConfig {
  /** Minimum confidence level to redact (defaults to MEDIUM) */
  minConfidence: PIIConfidence;
  /** Whether to show partial values (last 4 digits, domain) */
  partialRedaction: boolean;
  /** Custom format strings per PII type */
  typeFormats: Partial<Record<PIIType, string>>;
}

/**
 * Summary of redactions performed
 */
export interface RedactionSummary {
  totalRedactions: number;
  byType: Partial<Record<PIIType, number>>;
  byConfidence: Partial<Record<PIIConfidence, number>>;
  redactedPositions: Array<{
    start: number;
    end: number;
    type: PIIType;
    originalLength: number;
    replacementLength: number;
  }>;
  charactersRedacted: number;
}

/**
 * Result of a redaction operation
 */
export interface RedactionResult {
  originalText: string;
  redactedText: string;
  wasRedacted: boolean;
  summary: RedactionSummary;
}

/**
 * Default type-specific redaction formats
 */
const DEFAULT_TYPE_FORMATS: Record<PIIType, string> = {
  [PIIType.SSN]: '[REDACTED-SSN]',
  [PIIType.ACCOUNT_NUMBER]: '[REDACTED-ACCOUNT]',
  [PIIType.LOAN_NUMBER]: '[REDACTED-LOAN]',
  [PIIType.CREDIT_CARD]: '[REDACTED-CC]',
  [PIIType.EMAIL]: '[REDACTED-EMAIL]',
  [PIIType.PHONE]: '[REDACTED-PHONE]',
};

/**
 * Confidence level ordering for comparison
 */
const CONFIDENCE_ORDER: Record<PIIConfidence, number> = {
  [PIIConfidence.LOW]: 0,
  [PIIConfidence.MEDIUM]: 1,
  [PIIConfidence.HIGH]: 2,
};

/**
 * Default redaction configuration
 */
const DEFAULT_CONFIG: RedactionConfig = {
  minConfidence: PIIConfidence.MEDIUM,
  partialRedaction: false,
  typeFormats: {},
};

/**
 * PII Redactor Service
 */
export class PIIRedactorService {
  private piiDetectorInstance: PIIDetectorService;
  private config: RedactionConfig;

  constructor(piiDetectorService?: PIIDetectorService, config?: Partial<RedactionConfig>) {
    this.piiDetectorInstance = piiDetectorService || piiDetector;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RedactionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): RedactionConfig {
    return { ...this.config };
  }

  /**
   * Redact PII from text
   *
   * @param text - Text to redact
   * @param matches - Optional pre-detected PII matches (avoids re-detection)
   * @returns Redaction result with redacted text and summary
   */
  redact(text: string, matches?: PIIMatch[]): RedactionResult {
    // Use provided matches or detect new ones
    const piiMatches = matches ?? this.piiDetectorInstance.detectPII(text);

    // Filter by confidence threshold
    const toRedact = piiMatches.filter((m) =>
      this.meetsConfidenceThreshold(m.confidence)
    );

    if (toRedact.length === 0) {
      return {
        originalText: text,
        redactedText: text,
        wasRedacted: false,
        summary: this.buildEmptySummary(),
      };
    }

    // Sort by position (descending) to avoid offset issues when replacing
    const sortedMatches = [...toRedact].sort((a, b) => b.start - a.start);

    let redactedText = text;
    const positions: RedactionSummary['redactedPositions'] = [];

    for (const match of sortedMatches) {
      const replacement = this.getReplacementText(match);
      redactedText =
        redactedText.slice(0, match.start) +
        replacement +
        redactedText.slice(match.end);

      positions.push({
        start: match.start,
        end: match.end,
        type: match.type,
        originalLength: match.end - match.start,
        replacementLength: replacement.length,
      });
    }

    // Reverse positions to be in ascending order for the summary
    positions.reverse();

    const summary = this.buildSummary(toRedact, positions);

    logger.debug('PII redaction completed', {
      event: 'PII_REDACTION_COMPLETE',
      totalRedactions: summary.totalRedactions,
      byType: summary.byType,
    });

    return {
      originalText: text,
      redactedText,
      wasRedacted: true,
      summary,
    };
  }

  /**
   * Redact PII from JSON while preserving structure
   */
  redactJSON(jsonString: string): RedactionResult {
    try {
      const parsed = JSON.parse(jsonString);
      const summary = this.buildEmptySummary();
      const redacted = this.redactObjectRecursive(parsed, summary);
      const redactedText = JSON.stringify(redacted, null, 2);

      return {
        originalText: jsonString,
        redactedText,
        wasRedacted: summary.totalRedactions > 0,
        summary,
      };
    } catch {
      // Not valid JSON, redact as plain text
      return this.redact(jsonString);
    }
  }

  /**
   * Recursively redact PII in an object
   */
  private redactObjectRecursive(
    obj: unknown,
    summary: RedactionSummary
  ): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      const result = this.redact(obj);
      // Merge the summary
      if (result.wasRedacted) {
        summary.totalRedactions += result.summary.totalRedactions;
        summary.charactersRedacted += result.summary.charactersRedacted;
        for (const [type, count] of Object.entries(result.summary.byType)) {
          const piiType = type as PIIType;
          summary.byType[piiType] = (summary.byType[piiType] || 0) + (count || 0);
        }
        for (const [confidence, count] of Object.entries(result.summary.byConfidence)) {
          const confLevel = confidence as PIIConfidence;
          summary.byConfidence[confLevel] = (summary.byConfidence[confLevel] || 0) + (count || 0);
        }
      }
      return result.redactedText;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObjectRecursive(item, summary));
    }

    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.redactObjectRecursive(value, summary);
      }
      return result;
    }

    // Numbers, booleans, etc. - return as-is
    return obj;
  }

  /**
   * Check if a confidence level meets the threshold
   */
  private meetsConfidenceThreshold(confidence: PIIConfidence): boolean {
    return CONFIDENCE_ORDER[confidence] >= CONFIDENCE_ORDER[this.config.minConfidence];
  }

  /**
   * Get the replacement text for a PII match
   */
  private getReplacementText(match: PIIMatch): string {
    if (this.config.partialRedaction) {
      const partial = this.getPartialRedaction(match);
      if (partial) return partial;
    }

    // Use custom format if provided, otherwise use default
    return (
      this.config.typeFormats[match.type] ||
      DEFAULT_TYPE_FORMATS[match.type] ||
      '[REDACTED]'
    );
  }

  /**
   * Get partial redaction (showing last 4 digits, domain, etc.)
   */
  private getPartialRedaction(match: PIIMatch): string | null {
    switch (match.type) {
      case PIIType.SSN: {
        const digitsOnly = match.value.replace(/\D/g, '');
        if (digitsOnly.length >= 4) {
          const lastFour = digitsOnly.slice(-4);
          return `***-**-${lastFour}`;
        }
        return null;
      }

      case PIIType.CREDIT_CARD: {
        const digitsOnly = match.value.replace(/\D/g, '');
        if (digitsOnly.length >= 4) {
          const lastFour = digitsOnly.slice(-4);
          return `****-****-****-${lastFour}`;
        }
        return null;
      }

      case PIIType.EMAIL: {
        const atIndex = match.value.indexOf('@');
        if (atIndex > 0) {
          const domain = match.value.substring(atIndex + 1);
          return `[REDACTED]@${domain}`;
        }
        return null;
      }

      case PIIType.PHONE: {
        const digitsOnly = match.value.replace(/\D/g, '');
        if (digitsOnly.length >= 4) {
          const lastFour = digitsOnly.slice(-4);
          return `***-***-${lastFour}`;
        }
        return null;
      }

      case PIIType.ACCOUNT_NUMBER:
      case PIIType.LOAN_NUMBER: {
        // Show last 3 characters for account/loan numbers
        const value = match.value;
        if (value.length >= 3) {
          const lastThree = value.slice(-3);
          return `[REDACTED]-${lastThree}`;
        }
        return null;
      }

      default:
        return null;
    }
  }

  /**
   * Build the redaction summary
   */
  private buildSummary(
    matches: PIIMatch[],
    positions: RedactionSummary['redactedPositions']
  ): RedactionSummary {
    const byType: Partial<Record<PIIType, number>> = {};
    const byConfidence: Partial<Record<PIIConfidence, number>> = {};
    let charactersRedacted = 0;

    for (const match of matches) {
      byType[match.type] = (byType[match.type] || 0) + 1;
      byConfidence[match.confidence] = (byConfidence[match.confidence] || 0) + 1;
      charactersRedacted += match.end - match.start;
    }

    return {
      totalRedactions: matches.length,
      byType,
      byConfidence,
      redactedPositions: positions,
      charactersRedacted,
    };
  }

  /**
   * Build an empty summary
   */
  private buildEmptySummary(): RedactionSummary {
    return {
      totalRedactions: 0,
      byType: {},
      byConfidence: {},
      redactedPositions: [],
      charactersRedacted: 0,
    };
  }

  /**
   * Create a redactor with specific configuration
   */
  static withConfig(config: Partial<RedactionConfig>): PIIRedactorService {
    return new PIIRedactorService(undefined, config);
  }

  /**
   * Create a redactor that only redacts HIGH confidence matches
   */
  static highConfidenceOnly(): PIIRedactorService {
    return new PIIRedactorService(undefined, {
      minConfidence: PIIConfidence.HIGH,
    });
  }

  /**
   * Create a redactor that shows partial values
   */
  static withPartialRedaction(): PIIRedactorService {
    return new PIIRedactorService(undefined, {
      partialRedaction: true,
    });
  }
}

// Export singleton instance with default config
export const piiRedactor = new PIIRedactorService();
