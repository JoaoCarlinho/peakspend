import {
  TextractClient,
  AnalyzeExpenseCommand,
  AnalyzeExpenseCommandInput,
} from '@aws-sdk/client-textract';
import logger from '../config/logger';

export interface OcrResult {
  merchant?: string;
  date?: string;
  amount?: number;
  lineItems?: Array<{ description: string; amount?: number }>;
  confidence: {
    merchant?: number;
    date?: number;
    amount?: number;
  };
  rawData?: unknown;
}

export class OcrService {
  private textractClient: TextractClient | null = null;
  private s3BucketName: string;
  private useMockOcr: boolean = false;

  constructor() {
    const region = process.env['AWS_REGION'] || 'us-east-1';
    this.s3BucketName = process.env['S3_BUCKET_NAME'] || 'peakspend-receipts-dev';
    const isTestEnv = process.env['NODE_ENV'] === 'test';

    // Always use mock OCR in test environment
    if (isTestEnv) {
      this.useMockOcr = true;
    } else {
      // Use default credential chain (supports IAM roles for App Runner/ECS/Lambda)
      // The SDK will automatically use: env vars, IAM roles, or config files
      this.textractClient = new TextractClient({
        region,
        // Adaptive retry with exponential backoff for handling throttling
        maxAttempts: 3,
        retryMode: 'adaptive',
      });
      logger.info('🔍 AWS Textract client initialized with adaptive retry logic');
    }
  }

  async processReceipt(s3Key: string): Promise<OcrResult> {
    // Use mock OCR in development when AWS credentials are not configured
    if (this.useMockOcr) {
      return this.generateMockOcrResult(s3Key);
    }

    const input: AnalyzeExpenseCommandInput = {
      Document: {
        S3Object: {
          Bucket: this.s3BucketName,
          Name: s3Key,
        },
      },
    };

    const command = new AnalyzeExpenseCommand(input);
    const response = await this.textractClient!.send(command);
    return this.parseTextractResponse(response);
  }

  /**
   * Generate mock OCR result for development and testing
   * Extracts basic info from filename and returns simulated data
   * Provides consistent, predictable results for testing
   */
  private generateMockOcrResult(s3Key: string): OcrResult {
    logger.info(`📄 Mock OCR: Generating simulated data for ${s3Key}`);

    // Generate semi-realistic mock data
    // Use deterministic selection based on s3Key for consistent test results
    const merchants = [
      'Whole Foods Market',
      'Starbucks Coffee',
      'Shell Gas Station',
      'Target',
      'Amazon',
      'Walmart',
      'CVS Pharmacy',
      'Home Depot',
    ];
    
    // Use hash of s3Key for deterministic selection in tests
    const keyHash = s3Key.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const merchantIndex = keyHash % merchants.length;
    const randomMerchant = merchants[merchantIndex] ?? 'Unknown Merchant';
    
    // Generate deterministic amount based on key hash
    const baseAmount = 10 + (keyHash % 140); // Amount between 10 and 150
    const randomAmount = baseAmount.toFixed(2);
    
    // Generate date within last 30 days, deterministic based on key
    const daysAgo = keyHash % 30;
    const randomDate = new Date(
      Date.now() - daysAgo * 24 * 60 * 60 * 1000
    ).toISOString();

    const amount = parseFloat(randomAmount);
    const item1Amount = parseFloat((amount * 0.6).toFixed(2));
    const item2Amount = parseFloat((amount * 0.4).toFixed(2));

    return {
      merchant: randomMerchant,
      date: randomDate,
      amount: amount,
      lineItems: [
        { description: 'Item 1', amount: item1Amount },
        { description: 'Item 2', amount: item2Amount },
      ],
      confidence: {
        merchant: 0.85,
        date: 0.90,
        amount: 0.95,
      },
      rawData: { mock: true, s3Key, test: process.env['NODE_ENV'] === 'test' },
    };
  }

  private parseTextractResponse(response: unknown): OcrResult {
    const result: OcrResult = { confidence: {}, lineItems: [] };
    const resp = response as { ExpenseDocuments?: Array<{ SummaryFields?: Array<{ Type?: { Text?: string }; ValueDetection?: { Text?: string; Confidence?: number } }>; LineItemGroups?: Array<{ LineItems?: Array<{ LineItemExpenseFields?: Array<{ Type?: { Text?: string }; ValueDetection?: { Text?: string } }> }> }> }> };

    if (!resp.ExpenseDocuments || resp.ExpenseDocuments.length === 0) return result;
    const expenseDoc = resp.ExpenseDocuments[0];
    if (!expenseDoc) return result;

    if (expenseDoc.SummaryFields) {
      for (const field of expenseDoc.SummaryFields) {
        const fieldType = field.Type?.Text?.toUpperCase();
        const value = field.ValueDetection?.Text;
        const confidence = field.ValueDetection?.Confidence;
        if (!value) continue;

        if (fieldType === 'VENDOR' || fieldType === 'NAME') {
          result.merchant = this.normalizeMerchant(value);
          if (confidence !== undefined) result.confidence.merchant = confidence;
        } else if (fieldType === 'INVOICE_RECEIPT_DATE' || fieldType === 'DATE') {
          result.date = this.normalizeDate(value);
          if (confidence !== undefined) result.confidence.date = confidence;
        } else if (fieldType === 'TOTAL' || fieldType === 'AMOUNT_PAID') {
          const amt = this.normalizeAmount(value);
          if (amt !== undefined) result.amount = amt;
          if (confidence !== undefined) result.confidence.amount = confidence;
        }
      }
    }

    if (expenseDoc.LineItemGroups) {
      for (const group of expenseDoc.LineItemGroups) {
        if (group.LineItems) {
          for (const lineItem of group.LineItems) {
            if (lineItem.LineItemExpenseFields) {
              const item: { description: string; amount?: number } = { description: '' };
              for (const field of lineItem.LineItemExpenseFields) {
                const fieldType = field.Type?.Text?.toUpperCase();
                const value = field.ValueDetection?.Text;
                if (!value) continue;

                if (fieldType === 'ITEM' || fieldType === 'DESCRIPTION') {
                  item.description = value;
                } else if (fieldType === 'PRICE' || fieldType === 'AMOUNT') {
                  const amt = this.normalizeAmount(value);
                  if (amt !== undefined) item.amount = amt;
                }
              }
              if (item.description) result.lineItems?.push(item);
            }
          }
        }
      }
    }

    result.rawData = response;
    return result;
  }

  private normalizeMerchant(merchant: string): string {
    return merchant.trim().replace(/\s+/g, ' ').replace(/(INC|LLC|LTD|CORP|CO)\s*$/i, '').trim();
  }

  private normalizeDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) return date.toISOString();
    } catch {
      // ignore
    }
    return dateStr;
  }

  private normalizeAmount(amountStr: string): number | undefined {
    try {
      const cleaned = amountStr.replace(/[$,€£¥]/g, '').trim();
      const amount = parseFloat(cleaned);
      if (!isNaN(amount) && amount > 0) return amount;
    } catch {
      // ignore
    }
    return undefined;
  }
}
