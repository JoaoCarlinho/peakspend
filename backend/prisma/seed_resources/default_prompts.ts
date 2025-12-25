/**
 * Default System Prompts
 *
 * Contains all system prompts that are migrated from hardcoded strings
 * in the OllamaService to database-backed storage.
 *
 * Prompts are organized by feature area and include both system
 * and user prompt templates.
 */

import { computePromptHash } from '../../src/llm/prompts/promptValidator.service';

/**
 * Prompt definition interface
 */
export interface PromptDefinition {
  name: string;
  content: string;
  contentHash: string;
  version: number;
  isActive: boolean;
  createdBy: string;
}

/**
 * Receipt OCR Enhancement Prompts
 */
const RECEIPT_OCR_SYSTEM = `You are a receipt parsing expert. Always return valid JSON.`;

const RECEIPT_OCR_USER_TEMPLATE = `You are an expert at parsing receipt data. Extract structured information from this receipt text.

Receipt Text:
{{RAW_OCR_TEXT}}

Return a JSON object with:
- merchant: string (the store/restaurant name)
- amount: number (total amount paid)
- date: string (ISO format YYYY-MM-DD, infer if not explicit)
- items: array of {name, quantity, price} if itemized
- category_hint: string (suggest ONE category: Groceries, Dining, Transportation, Shopping, Entertainment, or Other)
- confidence: number (0.0-1.0, how confident you are in the extraction)

Be precise. If a field is unclear, use null. Return ONLY valid JSON, no markdown formatting.`;

/**
 * Spending Insights Prompts
 */
const SPENDING_INSIGHTS_SYSTEM = `You are a financial advisor focused on actionable insights. Always return valid JSON.`;

const SPENDING_INSIGHTS_USER_TEMPLATE = `You are a personal finance advisor. Analyze this spending data and provide 3-5 actionable insights.

Spending Summary ({{TIMEFRAME}}):
- Total: ${{TOTAL_EXPENSES}}
{{SPENDING_CHANGE_LINE}}

Category Breakdown:
{{CATEGORY_BREAKDOWN}}

{{TOP_MERCHANTS_SECTION}}

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

/**
 * Category Recommendations Prompts
 */
const CATEGORY_RECOMMENDATIONS_SYSTEM = `You are a financial advisor. Always return valid JSON.`;

const CATEGORY_RECOMMENDATIONS_USER_TEMPLATE = `As a financial advisor specializing in {{CATEGORY}}, analyze this spending and provide 2-3 specific recommendations.

{{CATEGORY}} Spending:
- Total: ${{TOTAL_AMOUNT}}
- Transactions: {{TRANSACTION_COUNT}}
- Average per transaction: ${{AVG_AMOUNT}}
- Top merchants: {{TOP_MERCHANTS}}

Provide category-specific insights as JSON array with:
- type: "savings_opportunity" | "trend_alert" | "category_insight"
- title: specific to {{CATEGORY}}
- description: actionable advice
- actionable_steps: concrete actions for {{CATEGORY}}
- confidence: 0.0-1.0

Return ONLY valid JSON array, no markdown.`;

/**
 * All default prompts with computed hashes
 */
function createPromptDefinitions(): PromptDefinition[] {
  const prompts = [
    // Receipt OCR prompts
    {
      name: 'receipt_ocr_system',
      content: RECEIPT_OCR_SYSTEM,
    },
    {
      name: 'receipt_ocr_user',
      content: RECEIPT_OCR_USER_TEMPLATE,
    },

    // Spending Insights prompts
    {
      name: 'spending_insights_system',
      content: SPENDING_INSIGHTS_SYSTEM,
    },
    {
      name: 'spending_insights_user',
      content: SPENDING_INSIGHTS_USER_TEMPLATE,
    },

    // Category Recommendations prompts
    {
      name: 'category_recommendations_system',
      content: CATEGORY_RECOMMENDATIONS_SYSTEM,
    },
    {
      name: 'category_recommendations_user',
      content: CATEGORY_RECOMMENDATIONS_USER_TEMPLATE,
    },
  ];

  return prompts.map((p) => ({
    name: p.name,
    content: p.content,
    contentHash: computePromptHash(p.content),
    version: 1,
    isActive: true,
    createdBy: 'migration',
  }));
}

export const defaultPrompts = createPromptDefinitions();

/**
 * Get a prompt by name
 */
export function getDefaultPrompt(name: string): PromptDefinition | undefined {
  return defaultPrompts.find((p) => p.name === name);
}
