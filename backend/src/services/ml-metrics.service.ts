import { PrismaClient } from '../generated/prisma/client';

/**
 * ML Metrics Service
 *
 * Tracks ML model performance and accuracy metrics
 * Story 5-5, 5-6, 5-7
 */

export interface AccuracyMetrics {
  overallAccuracy: number;
  categoryAccuracy: Map<string, number>;
  predictionConfidenceAvg: number;
  totalPredictions: number;
  correctPredictions: number;
}

export interface PerformanceDashboard {
  currentAccuracy: number;
  accuracyTrend: Array<{ date: string; accuracy: number }>;
  categoryBreakdown: Array<{ category: string; accuracy: number; predictions: number }>;
  improvementMetrics: {
    accuracyChange30Days: number;
    accuracyChange7Days: number;
    totalFeedbackCount: number;
  };
  recentErrors: Array<{
    merchant: string;
    predicted: string;
    actual: string;
    date: string;
  }>;
}

export interface ImprovementMetrics {
  accuracyImprovement: number;
  learningRate: number;
  userEngagement: number;
  timeSavings: {
    manualCategorizationsBefore: number;
    autoCategorizationsNow: number;
    percentageReduction: number;
  };
}

export class MlMetricsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Calculate accuracy metrics (Story 5-5)
   */
  async calculateAccuracy(userId: string, days: number = 30): Promise<AccuracyMetrics> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const feedback = await this.prisma.trainingData.findMany({
      where: {
        userId,
        timestamp: { gte: since },
        predictedCategory: { not: null },
        actualCategory: { not: null },
      },
    });

    const totalPredictions = feedback.length;
    if (totalPredictions === 0) {
      return {
        overallAccuracy: 0,
        categoryAccuracy: new Map(),
        predictionConfidenceAvg: 0,
        totalPredictions: 0,
        correctPredictions: 0,
      };
    }

    const correctPredictions = feedback.filter(
      (f) => f.predictedCategory === f.actualCategory || f.feedbackType === 'ACCEPT'
    ).length;

    const overallAccuracy = correctPredictions / totalPredictions;

    // Calculate per-category accuracy
    const categoryAccuracy = new Map<string, number>();
    const categoryGroups = new Map<string, { correct: number; total: number }>();

    feedback.forEach((f) => {
      const category = f.actualCategory || 'Unknown';
      if (!categoryGroups.has(category)) {
        categoryGroups.set(category, { correct: 0, total: 0 });
      }
      const stats = categoryGroups.get(category)!;
      stats.total++;
      if (f.predictedCategory === f.actualCategory || f.feedbackType === 'ACCEPT') {
        stats.correct++;
      }
    });

    categoryGroups.forEach((stats, category) => {
      categoryAccuracy.set(category, stats.correct / stats.total);
    });

    return {
      overallAccuracy,
      categoryAccuracy,
      predictionConfidenceAvg: 0.75, // Placeholder - would come from actual ML model
      totalPredictions,
      correctPredictions,
    };
  }

  /**
   * Get performance dashboard data (Story 5-6)
   */
  async getPerformanceDashboard(userId: string): Promise<PerformanceDashboard> {
    // Current accuracy
    const currentMetrics = await this.calculateAccuracy(userId, 30);

    // Accuracy trend (last 30 days, grouped by week)
    const accuracyTrend = await this.calculateAccuracyTrend(userId, 30);

    // Category breakdown
    const categoryBreakdown = await this.calculateCategoryBreakdown(userId);

    // Improvement metrics
    const metrics7Days = await this.calculateAccuracy(userId, 7);
    const metrics30Days = await this.calculateAccuracy(userId, 30);
    const metrics60Days = await this.calculateAccuracy(userId, 60);

    const accuracyChange7Days = currentMetrics.overallAccuracy - metrics7Days.overallAccuracy;
    const accuracyChange30Days = metrics30Days.overallAccuracy - metrics60Days.overallAccuracy;

    const totalFeedbackCount = await this.prisma.trainingData.count({
      where: { userId },
    });

    // Recent errors
    const recentErrors = await this.getRecentErrors(userId, 10);

    return {
      currentAccuracy: currentMetrics.overallAccuracy,
      accuracyTrend,
      categoryBreakdown,
      improvementMetrics: {
        accuracyChange30Days,
        accuracyChange7Days,
        totalFeedbackCount,
      },
      recentErrors,
    };
  }

  /**
   * Calculate accuracy trend over time (Story 5-6)
   */
  private async calculateAccuracyTrend(
    userId: string,
    days: number
  ): Promise<Array<{ date: string; accuracy: number }>> {
    const trend: Array<{ date: string; accuracy: number }> = [];
    const weeksToCalculate = Math.ceil(days / 7);

    for (let i = 0; i < weeksToCalculate; i++) {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - i * 7);
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 7);

      const feedback = await this.prisma.trainingData.findMany({
        where: {
          userId,
          timestamp: { gte: startDate, lte: endDate },
          predictedCategory: { not: null },
          actualCategory: { not: null },
        },
      });

      if (feedback.length > 0) {
        const correct = feedback.filter(
          (f) => f.predictedCategory === f.actualCategory || f.feedbackType === 'ACCEPT'
        ).length;
        const accuracy = correct / feedback.length;
        const dateStr = startDate.toISOString().split('T')[0];
        if (dateStr) {
          trend.unshift({
            date: dateStr,
            accuracy,
          });
        }
      }
    }

    return trend;
  }

  /**
   * Calculate per-category breakdown (Story 5-6)
   */
  private async calculateCategoryBreakdown(
    userId: string
  ): Promise<Array<{ category: string; accuracy: number; predictions: number }>> {
    const feedback = await this.prisma.trainingData.findMany({
      where: {
        userId,
        predictedCategory: { not: null },
        actualCategory: { not: null },
      },
      orderBy: { timestamp: 'desc' },
      take: 500,
    });

    // Fetch all categories to map IDs to names
    const categories = await this.prisma.category.findMany({
      where: {
        OR: [{ userId }, { isDefault: true }],
      },
      select: {
        id: true,
        name: true,
      },
    });

    // Create category ID to name lookup map
    const categoryMap = new Map<string, string>();
    categories.forEach((cat) => categoryMap.set(cat.id, cat.name));

    const categoryStats = new Map<string, { correct: number; total: number }>();

    feedback.forEach((f) => {
      const categoryId = f.actualCategory || 'Unknown';
      const categoryName = categoryMap.get(categoryId) || categoryId;

      if (!categoryStats.has(categoryName)) {
        categoryStats.set(categoryName, { correct: 0, total: 0 });
      }
      const stats = categoryStats.get(categoryName)!;
      stats.total++;
      if (f.predictedCategory === f.actualCategory || f.feedbackType === 'ACCEPT') {
        stats.correct++;
      }
    });

    return Array.from(categoryStats.entries())
      .map(([category, stats]) => ({
        category,
        accuracy: stats.correct / stats.total,
        predictions: stats.total,
      }))
      .sort((a, b) => b.predictions - a.predictions);
  }

  /**
   * Get recent prediction errors (Story 5-6)
   */
  private async getRecentErrors(
    userId: string,
    limit: number
  ): Promise<Array<{ merchant: string; predicted: string; actual: string; date: string }>> {
    const errors = await this.prisma.trainingData.findMany({
      where: {
        userId,
        feedbackType: 'REJECT',
        expenseId: { not: null },
      },
      include: {
        expense: true,
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    // Fetch all categories to map IDs to names
    const categories = await this.prisma.category.findMany({
      where: {
        OR: [{ userId }, { isDefault: true }],
      },
      select: {
        id: true,
        name: true,
      },
    });

    // Create category ID to name lookup map
    const categoryMap = new Map<string, string>();
    categories.forEach((cat) => categoryMap.set(cat.id, cat.name));

    return errors
      .filter((e) => e.expense !== null)
      .map((e) => {
        const dateStr = e.timestamp.toISOString().split('T')[0];
        const predictedId = e.predictedCategory || 'Unknown';
        const actualId = e.actualCategory || 'Unknown';

        return {
          merchant: e.expense!.merchant || 'Unknown',
          predicted: categoryMap.get(predictedId) || predictedId,
          actual: categoryMap.get(actualId) || actualId,
          date: dateStr || '',
        };
      });
  }

  /**
   * Calculate improvement metrics (Story 5-7)
   */
  async getImprovementMetrics(userId: string): Promise<ImprovementMetrics> {
    // Compare first 30 days vs last 30 days
    const recentAccuracy = await this.calculateAccuracy(userId, 30);

    // Get all feedback to calculate early accuracy
    const allFeedback = await this.prisma.trainingData.findMany({
      where: {
        userId,
        predictedCategory: { not: null },
        actualCategory: { not: null },
      },
      orderBy: { timestamp: 'asc' },
    });

    let earlyAccuracy = 0;
    if (allFeedback.length >= 60) {
      const first30 = allFeedback.slice(0, 30);
      const correct = first30.filter(
        (f) => f.predictedCategory === f.actualCategory || f.feedbackType === 'ACCEPT'
      ).length;
      earlyAccuracy = correct / 30;
    }

    const accuracyImprovement = recentAccuracy.overallAccuracy - earlyAccuracy;

    // Learning rate (improvement per 100 samples)
    const learningRate = allFeedback.length > 0
      ? (accuracyImprovement / allFeedback.length) * 100
      : 0;

    // User engagement (feedback rate)
    const totalExpenses = await this.prisma.expense.count({ where: { userId } });
    const totalFeedback = allFeedback.length;
    const userEngagement = totalExpenses > 0 ? totalFeedback / totalExpenses : 0;

    // Time savings calculation
    const autoAccepts = await this.prisma.trainingData.count({
      where: { userId, feedbackType: 'ACCEPT' },
    });
    const manualCategories = await this.prisma.trainingData.count({
      where: { userId, feedbackType: 'MANUAL' },
    });

    const manualCategorizationsBefore = manualCategories + autoAccepts;
    const autoCategorizationsNow = autoAccepts;
    const percentageReduction = manualCategorizationsBefore > 0
      ? (autoAccepts / manualCategorizationsBefore) * 100
      : 0;

    return {
      accuracyImprovement,
      learningRate,
      userEngagement,
      timeSavings: {
        manualCategorizationsBefore,
        autoCategorizationsNow,
        percentageReduction,
      },
    };
  }
}
