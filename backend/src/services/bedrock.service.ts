import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import logger from '../config/logger';

/**
 * AWS Bedrock Service for LLM-powered features
 * Production replacement for Ollama
 *
 * Use Cases:
 * 1. Receipt OCR Enhancement - Structure raw OCR text into expense data
 * 2. Spending Insights - Generate personalized financial recommendations
 */

export interface StructuredReceipt {
  merchant: string;
  amount: number;
  date: string;
  items?: Array<{
    name: string;
    quantity?: number;
    price?: number;
  }>;
  notes?: string;
  category_hint?: string;
  confidence: number;
  raw_text?: string;
}

export interface SpendingInsight {
  type: 'savings_opportunity' | 'trend_alert' | 'budget_recommendation' | 'category_insight';
  title: string;
  description: string;
  impact: string;
  actionable_steps: string[];
  confidence: number;
}

export interface BedrockMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class BedrockService {
  private client: BedrockRuntimeClient | null = null;
  private modelId: string;
  private isEnabled: boolean = false;

  constructor() {
    const region = process.env['AWS_REGION'] || 'us-east-1';
    this.modelId = process.env['BEDROCK_MODEL_ID'] || 'anthropic.claude-3-haiku-20240307-v1:0';

    // Check if Bedrock should be enabled
    const llmProvider = process.env['LLM_PROVIDER'] || '';
    this.isEnabled = llmProvider === 'bedrock';

    if (this.isEnabled) {
      // Use default credential chain (supports IAM roles for App Runner/ECS/Lambda)
      // The SDK will automatically use: env vars, IAM roles, or config files
      this.client = new BedrockRuntimeClient({
        region,
        maxAttempts: 3,
      });
      logger.info('🤖 AWS Bedrock service initialized for LLM enhancement');
    }
  }

  /**
   * Check if Bedrock service is available
   */
  async isAvailable(): Promise<boolean> {
    return this.isEnabled && this.client !== null;
  }

  /**
   * USE CASE 1: Enhance Receipt OCR
   * Takes raw OCR text from Textract and structures it into expense data
   */
  async enhanceReceiptOCR(rawOcrText: string): Promise<StructuredReceipt> {
    if (!this.client) {
      throw new Error('Bedrock client not initialized');
    }

    const prompt = `You are an expert at parsing receipt data. Extract structured information from this receipt text.

Receipt Text:
${rawOcrText}

Return a JSON object with:
- merchant: string (the store/restaurant name)
- amount: number (total amount paid)
- date: string (ISO format YYYY-MM-DD, infer if not explicit)
- items: array of {name, quantity, price} if itemized
- notes: string (formatted itemized list of purchases for reference, e.g. "Items purchased:\\n- Organic Bananas x2 $3.99\\n- Almond Milk $4.50". Include item names, quantities, and prices if available. Return null if no items found)
- category_hint: string (suggest ONE category: Groceries, Dining, Transportation, Shopping, Entertainment, or Other)
- confidence: number (0.0-1.0, how confident you are in the extraction)

Be precise. If a field is unclear, use null. Return ONLY valid JSON, no markdown formatting or explanation.`;

    try {
      const response = await this.invokeModel(prompt);
      const parsed = this.parseJsonResponse(response) as {
        merchant?: string;
        amount?: string | number;
        date?: string;
        items?: Array<{ name: string; quantity?: number; price?: number }>;
        notes?: string;
        category_hint?: string;
        confidence?: number;
      };

      const defaultDate = new Date().toISOString().split('T')[0] || '';
      const result: StructuredReceipt = {
        merchant: parsed.merchant || 'Unknown',
        amount: parseFloat(String(parsed.amount)) || 0,
        date: parsed.date || defaultDate,
        items: parsed.items || [],
        confidence: parsed.confidence || 0.85,
        raw_text: rawOcrText,
      };
      if (parsed.notes) {
        result.notes = parsed.notes;
      }
      if (parsed.category_hint) {
        result.category_hint = parsed.category_hint;
      }
      return result;
    } catch (error) {
      logger.error('Bedrock receipt OCR enhancement failed:', error);
      // Return fallback with low confidence
      return {
        merchant: 'Unknown',
        amount: 0,
        date: new Date().toISOString().split('T')[0] || '',
        confidence: 0.1,
        raw_text: rawOcrText,
      };
    }
  }

  /**
   * USE CASE 2: Generate Spending Insights
   * Analyzes spending patterns and provides personalized recommendations
   */
  async generateSpendingInsights(spendingData: {
    totalExpenses: number;
    categoryBreakdown: Array<{ category: string; amount: number; count: number }>;
    timeframe: string;
    previousPeriodTotal?: number;
    averageExpenseAmount?: number;
    topMerchants?: Array<{ merchant: string; amount: number }>;
  }): Promise<SpendingInsight[]> {
    if (!this.client) {
      throw new Error('Bedrock client not initialized');
    }

    const { totalExpenses, categoryBreakdown, timeframe, previousPeriodTotal, topMerchants } = spendingData;

    const topCategories = categoryBreakdown
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const spendingChange = previousPeriodTotal
      ? ((totalExpenses - previousPeriodTotal) / previousPeriodTotal) * 100
      : null;

    const prompt = `You are a personal finance advisor. Analyze this spending data and provide 3-5 actionable insights.

Spending Summary (${timeframe}):
- Total: $${totalExpenses.toFixed(2)}
${spendingChange !== null ? `- Change from previous period: ${spendingChange > 0 ? '+' : ''}${spendingChange.toFixed(1)}%` : ''}

Category Breakdown:
${topCategories.map(c => `- ${c.category}: $${c.amount.toFixed(2)} (${c.count} transactions)`).join('\n')}

${topMerchants ? `Top Merchants:\n${topMerchants.slice(0, 5).map(m => `- ${m.merchant}: $${m.amount.toFixed(2)}`).join('\n')}` : ''}

Provide insights as a JSON array. Each insight should have:
- type: "savings_opportunity" | "trend_alert" | "budget_recommendation" | "category_insight"
- title: short title (max 50 chars)
- description: detailed explanation (max 200 chars)
- impact: estimated savings or benefit
- actionable_steps: array of 1-3 specific actions
- confidence: 0.0-1.0

Return ONLY valid JSON array, no markdown or explanation.`;

    try {
      const response = await this.invokeModel(prompt);
      const insights = this.parseJsonResponse(response) as SpendingInsight[];

      return insights
        .filter(i => i.title && i.description && i.type)
        .map(i => ({
          type: i.type,
          title: i.title.substring(0, 50),
          description: i.description.substring(0, 200),
          impact: i.impact || 'Unknown impact',
          actionable_steps: i.actionable_steps || [],
          confidence: i.confidence || 0.7,
        }));
    } catch (error) {
      logger.error('Bedrock spending insights generation failed:', error);
      return [{
        type: 'category_insight',
        title: 'Review your spending',
        description: `You've spent $${totalExpenses.toFixed(2)} in the ${timeframe}. Consider reviewing your largest categories for savings opportunities.`,
        impact: 'Monitor spending patterns',
        actionable_steps: ['Review category breakdown', 'Identify top merchants', 'Compare to previous periods'],
        confidence: 0.5,
      }];
    }
  }

  /**
   * USE CASE 3: Chat with Financial Assistant
   * Conversational chat for the financial assistant feature
   */
  async chat(messages: BedrockMessage[]): Promise<string> {
    if (!this.client) {
      throw new Error('Bedrock client not initialized');
    }

    // Separate system message from conversation messages
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    // Format for Claude models on Bedrock
    const requestBody: {
      anthropic_version: string;
      max_tokens: number;
      system?: string;
      messages: Array<{ role: string; content: string }>;
    } = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      messages: conversationMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    };

    // Add system message if present
    if (systemMessage) {
      requestBody.system = systemMessage.content;
    }

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await this.client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Extract text from Claude response format
    if (responseBody.content && responseBody.content[0] && responseBody.content[0].text) {
      return responseBody.content[0].text;
    }

    throw new Error('Unexpected Bedrock response format');
  }

  /**
   * Core method to invoke Bedrock model (single prompt)
   */
  private async invokeModel(prompt: string): Promise<string> {
    if (!this.client) {
      throw new Error('Bedrock client not initialized');
    }

    // Format for Claude models
    const requestBody = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await this.client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Extract text from Claude response format
    if (responseBody.content && responseBody.content[0] && responseBody.content[0].text) {
      return responseBody.content[0].text;
    }

    throw new Error('Unexpected Bedrock response format');
  }

  /**
   * Parse JSON from LLM response, handling markdown code blocks
   */
  private parseJsonResponse(response: string): Record<string, unknown> | unknown[] {
    let jsonStr = response.trim();

    // Remove markdown code blocks if present
    if (jsonStr.includes('```json')) {
      const match = jsonStr.match(/```json\s*\n?([\s\S]*?)```/);
      jsonStr = match && match[1] ? match[1].trim() : jsonStr;
    } else if (jsonStr.includes('```')) {
      const match = jsonStr.match(/```\s*\n?([\s\S]*?)```/);
      jsonStr = match && match[1] ? match[1].trim() : jsonStr;
    }

    // Remove trailing commas before closing braces/brackets
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

    return JSON.parse(jsonStr);
  }
}

// Singleton instance
export const bedrockService = new BedrockService();
