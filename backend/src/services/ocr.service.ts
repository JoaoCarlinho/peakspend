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
    const accessKeyId = process.env['AWS_ACCESS_KEY_ID'] || '';
    const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'] || '';

    // Check if AWS credentials are properly configured for Textract
    if (
      !accessKeyId ||
      !secretAccessKey ||
      accessKeyId === 'minioadmin' ||
      secretAccessKey === 'minioadmin' ||
      accessKeyId === 'your-access-key' ||
      secretAccessKey === 'your-secret-key'
    ) {
      console.warn(
        '⚠️  AWS Textract credentials not configured. Using mock OCR for development. ' +
          'Receipt processing will return simulated data.'
      );
      this.useMockOcr = true;
    } else {
      this.textractClient = new TextractClient({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
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
   * Generate mock OCR result for development
   * Extracts basic info from filename and returns simulated data
   */
  private generateMockOcrResult(s3Key: string): OcrResult {
    logger.info(`📄 Mock OCR: Generating simulated data for ${s3Key}`);

    // Generate semi-realistic mock data
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
    const randomMerchant = merchants[Math.floor(Math.random() * merchants.length)] ?? 'Unknown Merchant';
    const randomAmount = (Math.random() * 150 + 10).toFixed(2);
    const randomDate = new Date(
      Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000
    ).toISOString();

    return {
      merchant: randomMerchant,
      date: randomDate,
      amount: parseFloat(randomAmount),
      lineItems: [
        { description: 'Item 1', amount: parseFloat((parseFloat(randomAmount) * 0.6).toFixed(2)) },
        { description: 'Item 2', amount: parseFloat((parseFloat(randomAmount) * 0.4).toFixed(2)) },
      ],
      confidence: {
        merchant: 0.85,
        date: 0.90,
        amount: 0.95,
      },
      rawData: { mock: true, s3Key },
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
