import { PrismaClient, FeedbackType } from '../generated/prisma/client';

/**
 * Feedback Service
 *
 * Handles ML feedback collection and processing for continuous learning
 * Story 5-1, 5-2
 */

export interface FeedbackInput {
  expenseId?: string;
  predictedCategory?: string;
  actualCategory?: string;
  feedbackType: FeedbackType;
}

export interface FeedbackStats {
  totalFeedback: number;
  acceptRate: number;
  rejectRate: number;
  manualRate: number;
  recentAccuracy: number;
}

export class FeedbackService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Record user feedback on ML prediction (Story 5-1)
   */
  async recordFeedback(userId: string, feedback: FeedbackInput): Promise<void> {
    const data: {
      userId: string;
      expenseId?: string | null;
      predictedCategory?: string | null;
      actualCategory?: string | null;
      feedbackType: FeedbackType;
      timestamp: Date;
    } = {
      userId,
      feedbackType: feedback.feedbackType,
      timestamp: new Date(),
    };
    if (feedback.expenseId) data.expenseId = feedback.expenseId;
    if (feedback.predictedCategory) data.predictedCategory = feedback.predictedCategory;
    if (feedback.actualCategory) data.actualCategory = feedback.actualCategory;

    await this.prisma.trainingData.create({ data });
  }

  /**
   * Get feedback statistics (Story 5-1)
   */
  async getFeedbackStats(userId: string, days: number = 30): Promise<FeedbackStats> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const feedback = await this.prisma.trainingData.findMany({
      where: {
        userId,
        timestamp: { gte: since },
      },
    });

    const totalFeedback = feedback.length;
    if (totalFeedback === 0) {
      return {
        totalFeedback: 0,
        acceptRate: 0,
        rejectRate: 0,
        manualRate: 0,
        recentAccuracy: 0,
      };
    }

    const accepts = feedback.filter((f) => f.feedbackType === 'ACCEPT').length;
    const rejects = feedback.filter((f) => f.feedbackType === 'REJECT').length;
    const manuals = feedback.filter((f) => f.feedbackType === 'MANUAL').length;

    return {
      totalFeedback,
      acceptRate: accepts / totalFeedback,
      rejectRate: rejects / totalFeedback,
      manualRate: manuals / totalFeedback,
      recentAccuracy: accepts / totalFeedback,
    };
  }

  /**
   * Process feedback for model improvement (Story 5-2)
   * Returns actionable insights from recent feedback
   */
  async processFeedback(userId: string): Promise<{
    needsRetraining: boolean;
    accuracy: number;
    commonErrors: Array<{ predictedCategory: string; actualCategory: string; count: number }>;
  }> {
    const recentFeedback = await this.prisma.trainingData.findMany({
      where: {
        userId,
        predictedCategory: { not: null },
        actualCategory: { not: null },
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    if (recentFeedback.length < 10) {
      return {
        needsRetraining: false,
        accuracy: 0,
        commonErrors: [],
      };
    }

    // Calculate accuracy
    const correct = recentFeedback.filter(
      (f) => f.predictedCategory === f.actualCategory || f.feedbackType === 'ACCEPT'
    ).length;
    const accuracy = correct / recentFeedback.length;

    // Find common error patterns
    const errors = recentFeedback.filter(
      (f) => f.predictedCategory !== f.actualCategory && f.feedbackType === 'REJECT'
    );

    const errorCounts = new Map<string, number>();
    errors.forEach((error) => {
      const key = `${error.predictedCategory}:${error.actualCategory}`;
      errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
    });

    const commonErrors = Array.from(errorCounts.entries())
      .map(([key, count]) => {
        const [predictedCategory, actualCategory] = key.split(':');
        return { predictedCategory: predictedCategory || '', actualCategory: actualCategory || '', count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Trigger retraining if accuracy drops below 70%
    const needsRetraining = accuracy < 0.7 && recentFeedback.length >= 50;

    return {
      needsRetraining,
      accuracy,
      commonErrors,
    };
  }

  /**
   * Get training data for incremental learning (Story 5-3)
   */
  async getTrainingData(userId: string, limit: number = 1000): Promise<Array<{
    merchant: string | null;
    amount: number;
    category: string | null;
    feedbackType: FeedbackType;
  }>> {
    const trainingData = await this.prisma.trainingData.findMany({
      where: {
        userId,
        expenseId: { not: null },
        actualCategory: { not: null },
      },
      include: {
        expense: true,
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return trainingData
      .filter((data) => data.expense !== null)
      .map((data) => ({
        merchant: data.expense!.merchant,
        amount: Number(data.expense!.amount),
        category: data.actualCategory,
        feedbackType: data.feedbackType,
      }));
  }

  /**
   * Check if retraining should be triggered (Story 5-4)
   */
  async shouldTriggerRetraining(userId: string): Promise<{
    shouldRetrain: boolean;
    reason: string;
    newDataCount: number;
  }> {
    // Get the most recent model
    const latestModel = await this.prisma.mlModel.findFirst({
      where: { userId },
      orderBy: { trainingDate: 'desc' },
    });

    const lastTrainingDate = latestModel?.trainingDate || new Date(0);

    // Count new feedback since last training
    const newFeedback = await this.prisma.trainingData.count({
      where: {
        userId,
        timestamp: { gt: lastTrainingDate },
        actualCategory: { not: null },
      },
    });

    // Check accuracy
    const stats = await this.processFeedback(userId);

    // Trigger retraining if:
    // 1. Accuracy drops below 70%
    // 2. More than 100 new feedback samples
    // 3. More than 30 days since last training
    const daysSinceTraining = (Date.now() - lastTrainingDate.getTime()) / (1000 * 60 * 60 * 24);

    if (stats.needsRetraining) {
      return {
        shouldRetrain: true,
        reason: `Accuracy dropped to ${(stats.accuracy * 100).toFixed(1)}%`,
        newDataCount: newFeedback,
      };
    }

    if (newFeedback >= 100) {
      return {
        shouldRetrain: true,
        reason: `${newFeedback} new training samples available`,
        newDataCount: newFeedback,
      };
    }

    if (daysSinceTraining > 30 && newFeedback >= 20) {
      return {
        shouldRetrain: true,
        reason: `${Math.floor(daysSinceTraining)} days since last training`,
        newDataCount: newFeedback,
      };
    }

    return {
      shouldRetrain: false,
      reason: 'Model performance is stable',
      newDataCount: newFeedback,
    };
  }
}
