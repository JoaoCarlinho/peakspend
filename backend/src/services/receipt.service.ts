import { ollamaService } from './ollama.service';

/**
 * Receipt Processing Service
 * USE CASE 1: Receipt OCR Enhancement with Ollama
 *
 * Workflow:
 * 1. AWS Textract extracts raw text from receipt image
 * 2. Ollama LLM structures the text into expense data
 * 3. Returns structured data for expense creation
 */

export interface RawOCRResult {
  text: string;
  confidence: number;
  blocks?: Array<{
    text: string;
    type: string;
    confidence: number;
  }>;
}

export interface EnhancedReceiptData {
  merchant: string;
  amount: number;
  date: string;
  items: Array<{
    name: string;
    quantity?: number;
    price?: number;
  }>;
  suggestedCategory: string;
  confidence: number;
  processingMethod: 'ollama' | 'fallback';
  rawText: string;
}

export class ReceiptService {
  /**
   * Process receipt with Ollama enhancement
   * This is the main entry point for receipt processing
   */
  async processReceipt(rawOcrResult: RawOCRResult): Promise<EnhancedReceiptData> {
    const isOllamaAvailable = await ollamaService.isAvailable();

    if (isOllamaAvailable) {
      try {
        // USE CASE 1: Ollama-enhanced OCR parsing
        const structured = await ollamaService.enhanceReceiptOCR(rawOcrResult.text);

        return {
          merchant: structured.merchant,
          amount: structured.amount,
          date: structured.date,
          items: structured.items || [],
          suggestedCategory: structured.category_hint || 'Other',
          confidence: structured.confidence,
          processingMethod: 'ollama',
          rawText: rawOcrResult.text,
        };
      } catch (error) {
        console.error('Ollama receipt processing failed, falling back:', error);
        return this.fallbackProcessing(rawOcrResult);
      }
    } else {
      // Fallback to rule-based parsing
      return this.fallbackProcessing(rawOcrResult);
    }
  }

  /**
   * Fallback rule-based receipt parsing
   * Used when Ollama is not available
   */
  private fallbackProcessing(rawOcrResult: RawOCRResult): EnhancedReceiptData {
    const text = rawOcrResult.text;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Extract merchant (usually first significant line)
    const merchant = this.extractMerchant(lines);

    // Extract amount (look for total/amount patterns)
    const amount = this.extractAmount(lines);

    // Extract date (look for date patterns)
    const date = this.extractDate(lines);

    // Suggest category based on merchant keywords
    const suggestedCategory = this.suggestCategory(merchant);

    return {
      merchant,
      amount,
      date,
      items: [],
      suggestedCategory,
      confidence: 0.6, // Lower confidence for rule-based
      processingMethod: 'fallback',
      rawText: text,
    };
  }

  private extractMerchant(lines: string[]): string {
    // Look for merchant in first few lines
    // Skip lines that are just numbers, dates, or common words
    for (const line of lines.slice(0, 5)) {
      if (
        line.length > 3 &&
        !/^\d+$/.test(line) &&
        !/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(line) &&
        !['RECEIPT', 'INVOICE', 'TOTAL', 'SUBTOTAL'].includes(line.toUpperCase())
      ) {
        return line;
      }
    }
    return 'Unknown Merchant';
  }

  private extractAmount(lines: string[]): number {
    // Look for patterns like "TOTAL $XX.XX" or "Amount: XX.XX"
    const amountPatterns = [
      /TOTAL[:\s]*\$?(\d+\.\d{2})/i,
      /AMOUNT[:\s]*\$?(\d+\.\d{2})/i,
      /BALANCE[:\s]*\$?(\d+\.\d{2})/i,
      /\$(\d+\.\d{2})/,
    ];

    for (const line of lines) {
      for (const pattern of amountPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const amount = parseFloat(match[1]);
          if (amount > 0 && amount < 10000) {
            // Sanity check
            return amount;
          }
        }
      }
    }

    return 0;
  }

  private extractDate(lines: string[]): string {
    // Look for date patterns
    const datePatterns = [
      /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/,
      /(\d{1,2})[/-](\d{1,2})[/-](\d{2})/,
      /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/,
    ];

    for (const line of lines) {
      for (const pattern of datePatterns) {
        const match = line.match(pattern);
        if (match) {
          // Parse and convert to ISO format
          try {
            const date = new Date(match[0]);
            if (!isNaN(date.getTime())) {
              return date.toISOString().split('T')[0] || '';
            }
          } catch {
            // Continue trying other patterns
          }
        }
      }
    }

    // Default to today
    return new Date().toISOString().split('T')[0] || '';
  }

  private suggestCategory(merchant: string): string {
    const merchantLower = merchant.toLowerCase();

    const categoryKeywords: Record<string, string[]> = {
      Groceries: ['grocery', 'market', 'food', 'whole foods', 'trader', 'safeway', 'walmart'],
      Dining: ['restaurant', 'cafe', 'coffee', 'starbucks', 'mcdonald', 'pizza', 'burger'],
      Transportation: ['gas', 'fuel', 'uber', 'lyft', 'taxi', 'parking', 'metro'],
      Shopping: ['amazon', 'target', 'mall', 'store', 'shop'],
      Entertainment: ['cinema', 'theater', 'movie', 'netflix', 'spotify'],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => merchantLower.includes(kw))) {
        return category;
      }
    }

    return 'Other';
  }

  /**
   * Mock AWS Textract call for testing
   * In production, this would call actual AWS Textract
   */
  async extractTextFromImage(_imageData: Buffer | string): Promise<RawOCRResult> {
    // This is a placeholder - in production would use AWS Textract
    // For now, return mock data for testing
    return {
      text: `Whole Foods Market
123 Main St
Date: ${new Date().toISOString().split('T')[0]}

Organic Bananas    $3.99
Almond Milk        $4.50
Bread              $3.25

Subtotal          $11.74
Tax                $0.94
TOTAL             $12.68

Thank you!`,
      confidence: 0.95,
    };
  }
}

export const receiptService = new ReceiptService();
