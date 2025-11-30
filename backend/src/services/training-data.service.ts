import { PrismaClient, TrainingData, FeedbackType } from '../generated/prisma/client';
import logger from '../config/logger';

export interface RecordFeedbackInput {
  userId: string;
  expenseId: string;
  predictedCategory?: string;
  actualCategory: string;
  feedbackType: FeedbackType;
  confidenceScore?: number;
}

export interface TrainingDataStats {
  totalSamples: number;
  acceptedCount: number;
  correctedCount: number;
  categoryCounts: Record<string, number>;
  averageConfidence: number | null;
  oldestSample: Date | null;
  newestSample: Date | null;
}

export interface PreparedDataset {
  expenses: Array<{
    id: string;
    merchant: string | null;
    amount: number;
    date: Date;
    category: string;
    notes: string | null;
  }>;
  labels: string[];
  metadata: {
    userId: string;
    totalSamples: number;
    categoryDistribution: Record<string, number>;
    preparedAt: Date;
  };
}

/**
 * Service for managing ML training data and user feedback
 */
export class TrainingDataService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Record user feedback (accepted or corrected category)
   */
  async recordFeedback(data: RecordFeedbackInput): Promise<TrainingData> {
    // Verify expense exists and belongs to user
    const expense = await this.prisma.expense.findFirst({
      where: {
        id: data.expenseId,
        userId: data.userId,
      },
    });

    if (!expense) {
      throw new Error('Expense not found or does not belong to user');
    }

    // Create training data record
    const trainingData = await this.prisma.trainingData.create({
      data: {
        userId: data.userId,
        expenseId: data.expenseId,
        predictedCategory: data.predictedCategory ?? null,
        actualCategory: data.actualCategory,
        feedbackType: data.feedbackType,
        timestamp: new Date(),
      },
    });

    logger.info('User feedback recorded', {
      userId: data.userId,
      expenseId: data.expenseId,
      feedbackType: data.feedbackType,
      actualCategory: data.actualCategory,
    });

    return trainingData;
  }

  /**
   * Get training data for a user
   */
  async getTrainingData(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      feedbackType?: FeedbackType;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<TrainingData[]> {
    const { limit = 100, offset = 0, feedbackType, startDate, endDate } = options;

    const where: any = { userId };

    if (feedbackType) {
      where.feedbackType = feedbackType;
    }

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    return this.prisma.trainingData.findMany({
      where,
      include: {
        expense: true,
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get training data statistics for a user
   */
  async getStats(userId: string): Promise<TrainingDataStats> {
    const trainingData = await this.prisma.trainingData.findMany({
      where: { userId },
      select: {
        feedbackType: true,
        actualCategory: true,
        timestamp: true,
      },
    });

    if (trainingData.length === 0) {
      return {
        totalSamples: 0,
        acceptedCount: 0,
        correctedCount: 0,
        categoryCounts: {},
        averageConfidence: null,
        oldestSample: null,
        newestSample: null,
      };
    }

    const acceptedCount = trainingData.filter((d) => d.feedbackType === 'ACCEPT').length;
    const correctedCount = trainingData.filter((d) => d.feedbackType === 'REJECT' || d.feedbackType === 'MANUAL').length;

    // Category distribution
    const categoryCounts: Record<string, number> = {};
    trainingData.forEach((d) => {
      if (d.actualCategory) {
        categoryCounts[d.actualCategory] = (categoryCounts[d.actualCategory] || 0) + 1;
      }
    });

    // Sort timestamps
    const timestamps = trainingData.map((d) => d.timestamp).sort((a, b) => a.getTime() - b.getTime());

    return {
      totalSamples: trainingData.length,
      acceptedCount,
      correctedCount,
      categoryCounts,
      averageConfidence: null, // Not storing confidence in DB yet
      oldestSample: timestamps[0] ?? null,
      newestSample: timestamps[timestamps.length - 1] ?? null,
    };
  }

  /**
   * Prepare dataset for model training
   *
   * Fetches all labeled expenses for a user and returns feature-ready data
   */
  async prepareDataset(userId: string): Promise<PreparedDataset> {
    // Get all training data with linked expenses
    const trainingData = await this.prisma.trainingData.findMany({
      where: { userId, expenseId: { not: null } },
      include: {
        expense: true,
      },
      orderBy: { timestamp: 'asc' },
    });

    // Filter out entries without linked expenses
    const validData = trainingData.filter((d) => d.expense !== null);

    if (validData.length === 0) {
      throw new Error('No training data available for user');
    }

    // Extract expenses and labels
    const expenses = validData.map((d) => ({
      id: d.expense!.id,
      merchant: d.expense!.merchant,
      amount: d.expense!.amount.toNumber(),
      date: d.expense!.date,
      category: d.actualCategory || '',
      notes: d.expense!.notes,
    }));

    const labels = validData.map((d) => d.actualCategory || '');

    // Calculate category distribution
    const categoryDistribution: Record<string, number> = {};
    labels.forEach((label) => {
      categoryDistribution[label] = (categoryDistribution[label] || 0) + 1;
    });

    logger.info('Training dataset prepared', {
      userId,
      totalSamples: expenses.length,
      uniqueCategories: Object.keys(categoryDistribution).length,
    });

    return {
      expenses,
      labels,
      metadata: {
        userId,
        totalSamples: expenses.length,
        categoryDistribution,
        preparedAt: new Date(),
      },
    };
  }

  /**
   * Check data quality and return warnings
   */
  async checkDataQuality(
    userId: string
  ): Promise<{
    isValid: boolean;
    warnings: string[];
    sampleCount: number;
    categoryDistribution: Record<string, number>;
  }> {
    const dataset = await this.prepareDataset(userId);
    const warnings: string[] = [];

    // Check minimum samples
    if (dataset.expenses.length < 50) {
      warnings.push(
        `Insufficient training data: ${dataset.expenses.length} samples (minimum: 50 recommended)`
      );
    }

    // Check class imbalance
    const categoryCounts = Object.values(dataset.metadata.categoryDistribution);
    const maxCount = Math.max(...categoryCounts);
    const minCount = Math.min(...categoryCounts);

    if (maxCount / minCount > 5) {
      warnings.push(
        `Class imbalance detected: ratio ${(maxCount / minCount).toFixed(1)}:1. Consider balancing techniques.`
      );
    }

    // Check for very small classes
    Object.entries(dataset.metadata.categoryDistribution).forEach(([category, count]) => {
      if (count < 5) {
        warnings.push(`Category "${category}" has only ${count} samples (minimum: 5 recommended)`);
      }
    });

    const isValid = dataset.expenses.length >= 50 && warnings.length < 3;

    return {
      isValid,
      warnings,
      sampleCount: dataset.expenses.length,
      categoryDistribution: dataset.metadata.categoryDistribution,
    };
  }

  /**
   * Export training data to CSV format
   */
  async exportToCSV(userId: string): Promise<string> {
    const dataset = await this.prepareDataset(userId);

    // CSV header
    const header = ['id', 'merchant', 'amount', 'date', 'category', 'notes'].join(',');

    // CSV rows
    const rows = dataset.expenses.map((expense) => {
      return [
        expense.id,
        expense.merchant ? `"${expense.merchant.replace(/"/g, '""')}"` : '', // Escape quotes
        expense.amount,
        expense.date.toISOString(),
        `"${expense.category.replace(/"/g, '""')}"`,
        expense.notes ? `"${expense.notes.replace(/"/g, '""')}"` : '',
      ].join(',');
    });

    return [header, ...rows].join('\n');
  }
}
