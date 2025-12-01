import { Request, Response } from 'express';
import { PrismaClient, FeedbackType } from '../generated/prisma/client';
import { TrainingDataService } from '../services/training-data.service';
import logger from '../config/logger';

export class TrainingDataController {
  private trainingDataService: TrainingDataService;

  constructor() {
    const prisma = new PrismaClient();
    this.trainingDataService = new TrainingDataService(prisma);
  }

  /**
   * Record user feedback on category prediction
   */
  async recordFeedback(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const feedbackType = req.body.feedbackType as string;
      const validFeedbackType = FeedbackType[feedbackType as keyof typeof FeedbackType];
      if (!validFeedbackType) {
        throw new Error(`Invalid feedback type: ${feedbackType}`);
      }
      const feedback: Feedback = {
        userId: req.user!.id,
        expenseId: req.body.expenseId,
        predictedCategory: req.body.predictedCategory,
        actualCategory: req.body.actualCategory,
        feedbackType: validFeedbackType,
        confidenceScore: req.body.confidenceScore,
      };

      const trainingData = await this.trainingDataService.recordFeedback({
        userId,
        expenseId: feedback.expenseId,
        predictedCategory: feedback.predictedCategory,
        actualCategory: feedback.actualCategory,
        feedbackType: feedback.feedbackType,
        confidenceScore: feedback.confidenceScore,
      });

      res.status(201).json({
        success: true,
        data: trainingData,
      });
    } catch (error) {
      logger.error('Error recording feedback', { error, userId: req.user?.id });

      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to record feedback',
      });
    }
  }

  /**
   * Get training data for current user
   */
  async getTrainingData(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { limit, offset, feedbackType, startDate, endDate } = req.query;

      const options: {
        limit?: number;
        offset?: number;
        feedbackType?: FeedbackType;
        startDate?: Date;
        endDate?: Date;
      } = {};
      if (limit) options.limit = parseInt(limit as string);
      if (offset) options.offset = parseInt(offset as string);
      if (feedbackType) {
        const feedbackTypeStr = Array.isArray(feedbackType) ? feedbackType[0] : feedbackType;
        options.feedbackType = feedbackTypeStr as FeedbackType;
      }
      if (startDate) options.startDate = new Date(startDate as string);
      if (endDate) options.endDate = new Date(endDate as string);

      const trainingData = await this.trainingDataService.getTrainingData(userId, options);

      res.status(200).json({
        success: true,
        data: trainingData,
        count: trainingData.length,
      });
    } catch (error) {
      logger.error('Error retrieving training data', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve training data',
      });
    }
  }

  /**
   * Get training data statistics
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      const stats = await this.trainingDataService.getStats(userId);

      // Also check data quality
      let quality = null;
      if (stats.totalSamples > 0) {
        try {
          quality = await this.trainingDataService.checkDataQuality(userId);
        } catch (error) {
          logger.warn('Could not check data quality', { error, userId });
        }
      }

      res.status(200).json({
        success: true,
        data: {
          stats,
          quality,
        },
      });
    } catch (error) {
      logger.error('Error retrieving training data stats', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve training data statistics',
      });
    }
  }
}

interface Feedback {
  userId: string;
  expenseId: string;
  predictedCategory: string;
  actualCategory: string;
  feedbackType: FeedbackType;
  confidenceScore: number;
}
