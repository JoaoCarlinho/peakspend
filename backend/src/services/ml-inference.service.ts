import { PrismaClient } from '../generated/prisma/client';

/**
 * ML Inference Service
 *
 * Provides category predictions and recommendations for expenses
 * Story 4-1, 4-2, 4-3, 4-4, 4-5, 4-6, 4-7
 */

export interface CategoryPrediction {
  categoryId: string;
  categoryName: string;
  confidence: number;
  reasoning: string[];
}

export interface CategorySuggestion {
  predictions: CategoryPrediction[];
  topPrediction: CategoryPrediction;
  alternativePredictions: CategoryPrediction[];
}

export interface ErrorDetection {
  hasError: boolean;
  errorType?: 'duplicate' | 'unusual_amount' | 'unusual_category' | 'missing_data';
  message?: string;
  confidence: number;
}

export class MlInferenceService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Predict category for expense (Story 4-1, 4-2)
   */
  async predictCategory(userId: string, expenseData: {
    merchant: string;
    amount: number;
    date?: Date;
    notes?: string;
  }): Promise<CategorySuggestion> {
    const merchant = expenseData.merchant.toLowerCase();
    const amount = expenseData.amount;

    // Get user's categories
    const categories = await this.prisma.category.findMany({
      where: {
        OR: [
          { userId: null, isDefault: true },
          { userId },
        ],
      },
    });

    // Get user's expense history for pattern matching
    const recentExpenses = await this.prisma.expense.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 100,
      include: { category: true },
    });

    // Generate predictions based on patterns
    const predictions: CategoryPrediction[] = [];

    // Rule 1: Merchant keyword matching
    for (const category of categories) {
      const confidence = this.calculateMerchantConfidence(merchant, category.name, recentExpenses);
      if (confidence > 0.3) {
        predictions.push({
          categoryId: category.id,
          categoryName: category.name,
          confidence,
          reasoning: this.generateReasoning(merchant, amount, category.name, recentExpenses),
        });
      }
    }

    // Rule 2: Amount-based patterns
    const amountBasedPredictions = this.predictByAmount(amount, categories, recentExpenses);
    predictions.push(...amountBasedPredictions);

    // Rule 3: Temporal patterns (day of week, time of day)
    if (expenseData.date) {
      const temporalPredictions = this.predictByTemporal(expenseData.date, categories, recentExpenses);
      predictions.push(...temporalPredictions);
    }

    // Deduplicate and sort by confidence
    const uniquePredictions = this.deduplicatePredictions(predictions);
    const sortedPredictions = uniquePredictions.sort((a, b) => b.confidence - a.confidence);

    // Return top prediction and alternatives
    return {
      predictions: sortedPredictions,
      topPrediction: sortedPredictions[0] || this.getDefaultPrediction(categories),
      alternativePredictions: sortedPredictions.slice(1, 4),
    };
  }

  /**
   * Calculate confidence score (Story 4-3)
   */
  private calculateMerchantConfidence(
    merchant: string,
    categoryName: string,
    history: Array<{ merchant: string | null; category: { name: string } | null }>
  ): number {
    let confidence = 0;

    // Check historical matches
    const merchantMatches = history.filter(
      (exp) => exp.merchant?.toLowerCase().includes(merchant.split(/\s+/)[0] || '') &&
               exp.category?.name === categoryName
    );

    if (merchantMatches.length > 0) {
      confidence = Math.min(0.9, 0.5 + (merchantMatches.length * 0.1));
    }

    // Keyword matching for category names
    const keywords: Record<string, string[]> = {
      'Groceries': ['grocery', 'market', 'food', 'whole foods', 'trader', 'safeway'],
      'Transportation': ['uber', 'lyft', 'taxi', 'metro', 'transit', 'parking'],
      'Meals': ['restaurant', 'cafe', 'coffee', 'dining', 'pizza', 'burger'],
      'Entertainment': ['cinema', 'theater', 'movie', 'concert', 'spotify', 'netflix'],
      'Travel': ['hotel', 'airline', 'airbnb', 'flight', 'expedia'],
      'Office Supplies': ['staples', 'office', 'depot', 'amazon'],
    };

    const categoryKeywords = keywords[categoryName] || [];
    for (const keyword of categoryKeywords) {
      if (merchant.includes(keyword)) {
        confidence = Math.max(confidence, 0.7);
        break;
      }
    }

    return confidence;
  }

  /**
   * Generate explainable reasoning (Story 4-4)
   */
  private generateReasoning(
    merchant: string,
    amount: number,
    categoryName: string,
    history: Array<{ merchant: string | null; amount: { toString: () => string }; category: { name: string } | null }>
  ): string[] {
    const reasoning: string[] = [];

    // Merchant pattern
    const similarExpenses = history.filter(
      (exp) => exp.merchant?.toLowerCase().includes(merchant.split(/\s+/)[0] || '') &&
               exp.category?.name === categoryName
    );

    if (similarExpenses.length > 0) {
      reasoning.push(`You've categorized ${similarExpenses.length} similar expenses as ${categoryName}`);
    }

    // Amount pattern
    const avgAmountInCategory = this.calculateAverageAmount(history, categoryName);
    if (avgAmountInCategory && Math.abs(amount - avgAmountInCategory) < avgAmountInCategory * 0.3) {
      reasoning.push(`Amount ($${amount}) is typical for your ${categoryName} expenses`);
    }

    // Frequency pattern
    const categoryCount = history.filter((exp) => exp.category?.name === categoryName).length;
    if (categoryCount > 10) {
      reasoning.push(`${categoryName} is one of your frequent categories`);
    }

    return reasoning.length > 0 ? reasoning : ['Based on merchant name pattern'];
  }

  /**
   * Pattern-based recommendations (Story 4-5)
   */
  private predictByAmount(
    amount: number,
    categories: Array<{ id: string; name: string }>,
    history: Array<{ amount: { toString: () => string }; category: { name: string; id: string } | null }>
  ): CategoryPrediction[] {
    const predictions: CategoryPrediction[] = [];

    for (const category of categories) {
      const avgAmount = this.calculateAverageAmount(history, category.name);
      if (avgAmount) {
        const difference = Math.abs(amount - avgAmount) / avgAmount;
        if (difference < 0.3) {
          const confidence = Math.max(0, 0.6 - difference);
          predictions.push({
            categoryId: category.id,
            categoryName: category.name,
            confidence,
            reasoning: [`Amount matches your typical ${category.name} expenses`],
          });
        }
      }
    }

    return predictions;
  }

  /**
   * Temporal pattern recommendations (Story 4-5)
   */
  private predictByTemporal(
    date: Date,
    categories: Array<{ id: string; name: string }>,
    history: Array<{ date: Date; category: { name: string; id: string } | null }>
  ): CategoryPrediction[] {
    const predictions: CategoryPrediction[] = [];
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    for (const category of categories) {
      const categoryExpenses = history.filter((exp) => exp.category?.name === category.name);
      const weekendExpenses = categoryExpenses.filter((exp) => {
        const expDay = new Date(exp.date).getDay();
        return expDay === 0 || expDay === 6;
      });

      const weekendRatio = categoryExpenses.length > 0
        ? weekendExpenses.length / categoryExpenses.length
        : 0;

      if (isWeekend && weekendRatio > 0.6) {
        predictions.push({
          categoryId: category.id,
          categoryName: category.name,
          confidence: 0.5,
          reasoning: [`You typically make ${category.name} purchases on weekends`],
        });
      }
    }

    return predictions;
  }

  /**
   * Error detection for expenses (Story 4-6)
   */
  async detectErrors(userId: string, expenseData: {
    merchant: string;
    amount: number;
    categoryId?: string;
    date: Date;
  }): Promise<ErrorDetection> {
    // Check for duplicates
    const duplicateCheck = await this.checkDuplicate(userId, expenseData);
    if (duplicateCheck.hasError) return duplicateCheck;

    // Check for unusual amount
    const amountCheck = await this.checkUnusualAmount(userId, expenseData);
    if (amountCheck.hasError) return amountCheck;

    // Check for unusual category
    if (expenseData.categoryId) {
      const categoryCheck = await this.checkUnusualCategory(userId, {
        merchant: expenseData.merchant,
        categoryId: expenseData.categoryId,
      });
      if (categoryCheck.hasError) return categoryCheck;
    }

    return { hasError: false, confidence: 0.95 };
  }

  /**
   * Check for duplicate expenses (Story 4-6)
   */
  private async checkDuplicate(userId: string, expenseData: {
    merchant: string;
    amount: number;
    date: Date;
  }): Promise<ErrorDetection> {
    const startOfDay = new Date(expenseData.date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(expenseData.date);
    endOfDay.setHours(23, 59, 59, 999);

    const duplicates = await this.prisma.expense.findMany({
      where: {
        userId,
        merchant: expenseData.merchant,
        amount: expenseData.amount,
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    if (duplicates.length > 0) {
      return {
        hasError: true,
        errorType: 'duplicate',
        message: `Possible duplicate: You have ${duplicates.length} similar expense(s) on this date`,
        confidence: 0.8,
      };
    }

    return { hasError: false, confidence: 0.95 };
  }

  /**
   * Check for unusual amount (Story 4-6)
   */
  private async checkUnusualAmount(userId: string, expenseData: {
    merchant: string;
    amount: number;
  }): Promise<ErrorDetection> {
    const recentExpenses = await this.prisma.expense.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 100,
    });

    if (recentExpenses.length < 10) {
      return { hasError: false, confidence: 0.5 };
    }

    const amounts = recentExpenses.map((exp) => Number(exp.amount));
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const stdDev = Math.sqrt(
      amounts.reduce((sum, amount) => sum + Math.pow(amount - avg, 2), 0) / amounts.length
    );

    if (expenseData.amount > avg + (3 * stdDev)) {
      return {
        hasError: true,
        errorType: 'unusual_amount',
        message: `This amount ($${expenseData.amount}) is significantly higher than your typical expenses`,
        confidence: 0.7,
      };
    }

    return { hasError: false, confidence: 0.9 };
  }

  /**
   * Check for unusual category (Story 4-6)
   */
  private async checkUnusualCategory(userId: string, expenseData: {
    merchant: string;
    categoryId: string;
  }): Promise<ErrorDetection> {
    const merchantExpenses = await this.prisma.expense.findMany({
      where: {
        userId,
        merchant: {
          contains: expenseData.merchant.split(/\s+/)[0] || '',
          mode: 'insensitive',
        },
      },
      include: { category: true },
    });

    if (merchantExpenses.length > 3) {
      const categoryCounts: Record<string, number> = {};
      merchantExpenses.forEach((exp) => {
        if (exp.categoryId) {
          categoryCounts[exp.categoryId] = (categoryCounts[exp.categoryId] || 0) + 1;
        }
      });

      const categoryKeys = Object.keys(categoryCounts);
      if (categoryKeys.length === 0) {
        return { hasError: false, confidence: 0.9 };
      }

      const mostCommonCategory = categoryKeys.reduce((a, b) =>
        (categoryCounts[a] || 0) > (categoryCounts[b] || 0) ? a : b
      );

      if (mostCommonCategory !== expenseData.categoryId && (categoryCounts[mostCommonCategory] || 0) > merchantExpenses.length * 0.7) {
        const category = merchantExpenses.find((exp) => exp.categoryId === mostCommonCategory)?.category;
        return {
          hasError: true,
          errorType: 'unusual_category',
          message: `You usually categorize "${expenseData.merchant}" as ${category?.name || 'different category'}`,
          confidence: 0.75,
        };
      }
    }

    return { hasError: false, confidence: 0.9 };
  }

  // Helper methods
  private calculateAverageAmount(
    history: Array<{ amount: { toString: () => string }; category: { name: string } | null }>,
    categoryName: string
  ): number | null {
    const categoryExpenses = history.filter((exp) => exp.category?.name === categoryName);
    if (categoryExpenses.length === 0) return null;

    const sum = categoryExpenses.reduce((total, exp) => total + Number(exp.amount.toString()), 0);
    return sum / categoryExpenses.length;
  }

  private deduplicatePredictions(predictions: CategoryPrediction[]): CategoryPrediction[] {
    const seen = new Map<string, CategoryPrediction>();

    for (const pred of predictions) {
      const existing = seen.get(pred.categoryId);
      if (!existing || pred.confidence > existing.confidence) {
        seen.set(pred.categoryId, pred);
      }
    }

    return Array.from(seen.values());
  }

  private getDefaultPrediction(categories: Array<{ id: string; name: string }>): CategoryPrediction {
    const defaultCategory = categories[0] || { id: 'unknown', name: 'Uncategorized' };
    return {
      categoryId: defaultCategory.id,
      categoryName: defaultCategory.name,
      confidence: 0.3,
      reasoning: ['No strong pattern match found'],
    };
  }
}
