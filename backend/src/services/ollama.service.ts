import axios, { AxiosInstance } from 'axios';

/**
 * Ollama Service for LLM-powered features
 *
 * Use Cases:
 * 1. Receipt OCR Enhancement - Structure raw OCR text into expense data
 * 2. Spending Insights - Generate personalized financial recommendations
 */

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

export interface StructuredReceipt {
  merchant: string;
  amount: number;
  date: string;
  items?: Array<{
    name: string;
    quantity?: number;
    price?: number;
  }>;
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

export class OllamaService {
  private client: AxiosInstance;
  private defaultModel: string;

  constructor(
    baseUrl: string = process.env['OLLAMA_BASE_URL'] || 'http://localhost:11434',
    defaultModel: string = process.env['OLLAMA_MODEL'] || 'llama3.2'
  ) {
    this.defaultModel = defaultModel;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000, // 30 second timeout for LLM calls
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Check if Ollama service is available
   * Can be disabled via OLLAMA_ENABLED=false environment variable
   */
  async isAvailable(): Promise<boolean> {
    // Skip Ollama entirely if explicitly disabled (e.g., in AWS where Ollama isn't deployed)
    if (process.env['OLLAMA_ENABLED'] === 'false') {
      return false;
    }

    try {
      const response = await this.client.get('/api/tags');
      return response.status === 200;
    } catch (error) {
      // Log concise message instead of entire error object
      const message = error instanceof Error ? error.message : 'Connection failed';
      console.warn(`Ollama service not available: ${message}`);
      return false;
    }
  }

  /**
   * USE CASE 1: Enhance Receipt OCR
   * Takes raw OCR text from Textract and structures it into expense data
   */
  async enhanceReceiptOCR(rawOcrText: string): Promise<StructuredReceipt> {
    const prompt = `You are an expert at parsing receipt data. Extract structured information from this receipt text.

Receipt Text:
${rawOcrText}

Return a JSON object with:
- merchant: string (the store/restaurant name)
- amount: number (total amount paid)
- date: string (ISO format YYYY-MM-DD, infer if not explicit)
- items: array of {name, quantity, price} if itemized
- category_hint: string (suggest ONE category: Groceries, Dining, Transportation, Shopping, Entertainment, or Other)
- confidence: number (0.0-1.0, how confident you are in the extraction)

Be precise. If a field is unclear, use null. Return ONLY valid JSON, no markdown formatting.`;

    try {
      const response = await this.chatRaw([
        { role: 'system', content: 'You are a receipt parsing expert. Always return valid JSON.' },
        { role: 'user', content: prompt },
      ]);

      // Parse the LLM response
      const content = response.message.content.trim();

      // Remove markdown code blocks if present
      let jsonStr = content;
      if (content.includes('```json')) {
        const match = content.match(/```json\s*\n?([\s\S]*?)```/);
        jsonStr = match && match[1] ? match[1].trim() : content;
      } else if (content.includes('```')) {
        const match = content.match(/```\s*\n?([\s\S]*?)```/);
        jsonStr = match && match[1] ? match[1].trim() : content;
      }

      // Remove any trailing commas before closing braces/brackets
      jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

      const parsed = JSON.parse(jsonStr);

      return {
        merchant: parsed.merchant || 'Unknown',
        amount: parseFloat(parsed.amount) || 0,
        date: parsed.date || new Date().toISOString().split('T')[0],
        items: parsed.items || [],
        category_hint: parsed.category_hint,
        confidence: parsed.confidence || 0.5,
        raw_text: rawOcrText,
      };
    } catch (error) {
      console.error('Receipt OCR enhancement failed:', error);
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
   * USE CASE 4: Generate Spending Insights
   * Analyzes spending patterns and provides personalized recommendations
   */
  async generateSpendingInsights(spendingData: {
    totalExpenses: number;
    categoryBreakdown: Array<{ category: string; amount: number; count: number }>;
    timeframe: string; // e.g., "last 30 days"
    previousPeriodTotal?: number;
    averageExpenseAmount?: number;
    topMerchants?: Array<{ merchant: string; amount: number }>;
  }): Promise<SpendingInsight[]> {
    const { totalExpenses, categoryBreakdown, timeframe, previousPeriodTotal, topMerchants } = spendingData;

    // Calculate some metrics for the LLM
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
- impact: estimated savings or benefit (optional)
- actionable_steps: array of 1-3 specific actions the user can take
- confidence: 0.0-1.0 (how confident you are in this insight)

Focus on:
1. Unusual spending patterns or spikes
2. Opportunities to reduce recurring costs
3. Category-specific recommendations
4. Positive trends worth maintaining

Return ONLY valid JSON array, no markdown formatting.`;

    try {
      const response = await this.chatRaw([
        { role: 'system', content: 'You are a financial advisor focused on actionable insights. Always return valid JSON.' },
        { role: 'user', content: prompt },
      ]);

      const content = response.message.content.trim();

      // Remove markdown if present
      let jsonStr = content;
      if (content.includes('```json')) {
        const match = content.match(/```json\s*\n?([\s\S]*?)```/);
        jsonStr = match && match[1] ? match[1].trim() : content;
      } else if (content.includes('```')) {
        const match = content.match(/```\s*\n?([\s\S]*?)```/);
        jsonStr = match && match[1] ? match[1].trim() : content;
      }

      // Remove any trailing commas before closing braces/brackets
      jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

      const insights: SpendingInsight[] = JSON.parse(jsonStr);

      // Validate and filter insights
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
      console.error('Spending insights generation failed:', error);
      // Return fallback generic insight
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
   * USE CASE 4 Helper: Generate Category-Specific Recommendations
   * Provides targeted advice for a specific spending category
   */
  async getCategoryRecommendations(
    category: string,
    expenses: Array<{ merchant: string; amount: number; date: string }>
  ): Promise<SpendingInsight[]> {
    const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
    const avgAmount = totalAmount / expenses.length;
    const topMerchants = this.aggregateByMerchant(expenses).slice(0, 5);

    const prompt = `As a financial advisor specializing in ${category}, analyze this spending and provide 2-3 specific recommendations.

${category} Spending:
- Total: $${totalAmount.toFixed(2)}
- Transactions: ${expenses.length}
- Average per transaction: $${avgAmount.toFixed(2)}
- Top merchants: ${topMerchants.map(m => `${m.merchant} ($${m.amount.toFixed(2)})`).join(', ')}

Provide category-specific insights as JSON array with:
- type: "savings_opportunity" | "trend_alert" | "category_insight"
- title: specific to ${category}
- description: actionable advice
- actionable_steps: concrete actions for ${category}
- confidence: 0.0-1.0

Return ONLY valid JSON array, no markdown.`;

    try {
      const response = await this.chatRaw([
        { role: 'system', content: 'You are a financial advisor. Always return valid JSON.' },
        { role: 'user', content: prompt },
      ]);

      const content = response.message.content.trim();
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');

      return JSON.parse(jsonStr);
    } catch (error) {
      console.error('Category recommendations failed:', error);
      return [];
    }
  }

  /**
   * Public chat method for external services
   * Returns the assistant's message content as a string
   */
  async chat(messages: OllamaMessage[]): Promise<string> {
    const response = await this.chatRaw(messages);
    return response.message.content;
  }

  /**
   * Core chat method for Ollama API
   */
  private async chatRaw(
    messages: OllamaMessage[],
    model: string = this.defaultModel
  ): Promise<OllamaResponse> {
    const response = await this.client.post('/api/chat', {
      model,
      messages,
      stream: false,
    });

    return response.data;
  }

  /**
   * Helper: Aggregate expenses by merchant
   */
  private aggregateByMerchant(
    expenses: Array<{ merchant: string; amount: number }>
  ): Array<{ merchant: string; amount: number }> {
    const merchantTotals = new Map<string, number>();

    for (const expense of expenses) {
      const current = merchantTotals.get(expense.merchant) || 0;
      merchantTotals.set(expense.merchant, current + expense.amount);
    }

    return Array.from(merchantTotals.entries())
      .map(([merchant, amount]) => ({ merchant, amount }))
      .sort((a, b) => b.amount - a.amount);
  }
}

// Singleton instance
export const ollamaService = new OllamaService();
