import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
  getSpendingInsights,
  getCategoryInsights,
} from '../controllers/insights.controller';

/**
 * Insights Routes
 * USE CASE 4: Spending Insights & Recommendations
 *
 * Provides Ollama-powered spending insights and category recommendations
 * Gracefully falls back to rule-based insights when Ollama is unavailable
 */

const router = Router();

/**
 * GET /api/insights/spending?days=30
 * Get overall spending insights and recommendations
 *
 * Query params:
 *   - days: Number of days to analyze (default: 30)
 *
 * Response:
 *   - insights: Array of SpendingInsight objects
 *   - summary: { totalExpenses, periodDays, avgDailySpending, previousPeriodTotal, percentChange }
 *   - categoryBreakdown: Array of category spending data
 *   - topMerchants: Array of top 5 merchants by spending
 *   - ollamaEnabled: Boolean indicating if Ollama was used
 */
router.get('/spending', requireAuth, getSpendingInsights);

/**
 * GET /api/insights/category/:categoryId?days=30
 * Get category-specific insights and recommendations
 *
 * Params:
 *   - categoryId: Category to analyze
 *
 * Query params:
 *   - days: Number of days to analyze (default: 30)
 *
 * Response:
 *   - insights: Array of category-specific insights
 *   - categoryStats: { name, totalSpent, expenseCount, avgExpense, percentOfTotal }
 *   - topMerchants: Top merchants in this category
 *   - ollamaEnabled: Boolean indicating if Ollama was used
 */
router.get('/category/:categoryId', requireAuth, getCategoryInsights);

export default router;
