import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '../generated/prisma/client';
import { ollamaService } from '../services/ollama.service';

const prisma = new PrismaClient();

/**
 * Insights Controller
 * USE CASE 4: Spending Insights & Recommendations powered by Ollama
 */

/**
 * GET /api/insights/spending
 * Generate personalized spending insights using Ollama LLM
 */
export async function getSpendingInsights(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId!;
    const { days = 30 } = req.query;

    const daysNum = parseInt(days as string, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    // Get expenses for the period
    const expenses = await prisma.expense.findMany({
      where: {
        userId,
        date: { gte: startDate },
      },
      include: { category: true },
    });

    // Calculate category breakdown
    const categoryMap = new Map<string, { amount: number; count: number }>();
    let totalExpenses = 0;

    for (const expense of expenses) {
      const categoryName = expense.category?.name || 'Uncategorized';
      const amount = Number(expense.amount);
      totalExpenses += amount;

      const current = categoryMap.get(categoryName) || { amount: 0, count: 0 };
      categoryMap.set(categoryName, {
        amount: current.amount + amount,
        count: current.count + 1,
      });
    }

    const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      amount: data.amount,
      count: data.count,
    }));

    // Get previous period for comparison
    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - daysNum);

    const previousExpenses = await prisma.expense.findMany({
      where: {
        userId,
        date: { gte: previousStartDate, lt: startDate },
      },
    });

    const previousPeriodTotal = previousExpenses.reduce(
      (sum, e) => sum + Number(e.amount),
      0
    );

    // Get top merchants
    const merchantMap = new Map<string, number>();
    for (const expense of expenses) {
      if (expense.merchant) {
        const current = merchantMap.get(expense.merchant) || 0;
        merchantMap.set(expense.merchant, current + Number(expense.amount));
      }
    }

    const topMerchants = Array.from(merchantMap.entries())
      .map(([merchant, amount]) => ({ merchant, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // Check if Ollama is available
    const isOllamaAvailable = await ollamaService.isAvailable();

    let insights;
    if (isOllamaAvailable) {
      // Use Ollama for intelligent insights
      insights = await ollamaService.generateSpendingInsights({
        totalExpenses,
        categoryBreakdown,
        timeframe: `last ${daysNum} days`,
        previousPeriodTotal,
        topMerchants,
      });
    } else {
      // Fallback to rule-based insights
      insights = generateFallbackInsights(
        totalExpenses,
        previousPeriodTotal,
        categoryBreakdown,
        daysNum
      );
    }

    res.json({
      insights,
      summary: {
        totalExpenses,
        transactionCount: expenses.length,
        averageTransaction: expenses.length > 0 ? totalExpenses / expenses.length : 0,
        periodDays: daysNum,
        changeFromPrevious: previousPeriodTotal > 0
          ? ((totalExpenses - previousPeriodTotal) / previousPeriodTotal) * 100
          : null,
      },
      categoryBreakdown,
      topMerchants,
      ollamaEnabled: isOllamaAvailable,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/insights/category/:categoryId
 * Get category-specific recommendations
 */
export async function getCategoryInsights(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId!;
    const { categoryId } = req.params;
    const { days = 30 } = req.query;

    if (!categoryId) {
      res.status(400).json({ error: 'Category ID is required' });
      return;
    }

    const daysNum = parseInt(days as string, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    // Get category
    const category = await prisma.category.findFirst({
      where: {
        OR: [
          { id: categoryId, userId },
          { id: categoryId, isDefault: true },
        ],
      },
    });

    if (!category) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }

    // Get expenses in this category
    const expenses = await prisma.expense.findMany({
      where: {
        userId,
        categoryId: categoryId,
        date: { gte: startDate },
      },
      orderBy: { date: 'desc' },
    });

    if (expenses.length === 0) {
      res.json({
        category: category.name,
        insights: [],
        message: 'No expenses found in this category for the selected period',
      });
      return;
    }

    const isOllamaAvailable = await ollamaService.isAvailable();

    let insights;
    if (isOllamaAvailable) {
      insights = await ollamaService.getCategoryRecommendations(
        category.name,
        expenses.map(e => ({
          merchant: e.merchant || 'Unknown',
          amount: Number(e.amount),
          date: e.date.toISOString(),
        }))
      );
    } else {
      insights = [{
        type: 'category_insight' as const,
        title: `${category.name} spending summary`,
        description: `You have ${expenses.length} transactions totaling $${expenses.reduce((s, e) => s + Number(e.amount), 0).toFixed(2)} in this category.`,
        confidence: 0.8,
      }];
    }

    res.json({
      category: category.name,
      insights,
      stats: {
        transactionCount: expenses.length,
        totalAmount: expenses.reduce((sum, e) => sum + Number(e.amount), 0),
        averageAmount: expenses.reduce((sum, e) => sum + Number(e.amount), 0) / expenses.length,
      },
      ollamaEnabled: isOllamaAvailable,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Fallback insights when Ollama is not available
 */
function generateFallbackInsights(
  totalExpenses: number,
  previousPeriodTotal: number,
  categoryBreakdown: Array<{ category: string; amount: number; count: number }>,
  days: number
) {
  const insights = [];

  // Spending change alert
  if (previousPeriodTotal > 0) {
    const change = ((totalExpenses - previousPeriodTotal) / previousPeriodTotal) * 100;
    if (Math.abs(change) > 20) {
      insights.push({
        type: 'trend_alert',
        title: change > 0 ? 'Spending increased' : 'Spending decreased',
        description: `Your spending ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(change).toFixed(1)}% compared to the previous ${days} days.`,
        impact: `$${Math.abs(totalExpenses - previousPeriodTotal).toFixed(2)} ${change > 0 ? 'more' : 'less'} than before`,
        confidence: 0.9,
      });
    }
  }

  // Top category insight
  const topCategory = categoryBreakdown.sort((a, b) => b.amount - a.amount)[0];
  if (topCategory) {
    const percentage = (topCategory.amount / totalExpenses) * 100;
    if (percentage > 30) {
      insights.push({
        type: 'category_insight',
        title: `${topCategory.category} is your largest expense`,
        description: `${topCategory.category} accounts for ${percentage.toFixed(1)}% of your spending ($${topCategory.amount.toFixed(2)}).`,
        actionable_steps: [
          `Review your ${topCategory.category} purchases for potential savings`,
          'Consider setting a budget limit for this category',
        ],
        confidence: 0.85,
      });
    }
  }

  // High transaction frequency
  const highFreqCategory = categoryBreakdown.sort((a, b) => b.count - a.count)[0];
  if (highFreqCategory && highFreqCategory.count > 10) {
    insights.push({
      type: 'savings_opportunity',
      title: 'Frequent small purchases',
      description: `You made ${highFreqCategory.count} ${highFreqCategory.category} purchases. Small frequent expenses can add up.`,
      actionable_steps: [
        'Track these expenses more carefully',
        'Consider bulk purchasing or subscriptions for savings',
      ],
      confidence: 0.75,
    });
  }

  return insights;
}
