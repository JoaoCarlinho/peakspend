import { Request, Response, NextFunction } from 'express';
import { FeedbackService } from '../services/feedback.service';
import { getPrismaClient } from '../config/database';
import { FeedbackType } from '../generated/prisma/client';

/**
 * Feedback Controller
 *
 * Handles ML feedback collection endpoints
 * Story 5-1, 5-2, 5-3, 5-4
 */
export class FeedbackController {
  private feedbackService: FeedbackService;

  constructor() {
    const prisma = getPrismaClient();
    this.feedbackService = new FeedbackService(prisma);
  }

  /**
   * POST /api/feedback/record
   * Record user feedback on ML prediction
   */
  recordFeedback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { expenseId, predictedCategory, actualCategory, feedbackType } = req.body as {
        expenseId?: string;
        predictedCategory?: string;
        actualCategory?: string;
        feedbackType: string;
      };

      if (!feedbackType || !['ACCEPT', 'REJECT', 'MANUAL'].includes(feedbackType)) {
        res.status(400).json({ message: 'Invalid feedbackType. Must be ACCEPT, REJECT, or MANUAL' });
        return;
      }

      const feedbackInput: {
        expenseId?: string;
        predictedCategory?: string;
        actualCategory?: string;
        feedbackType: FeedbackType;
      } = {
        feedbackType: feedbackType as FeedbackType,
      };
      if (expenseId) feedbackInput.expenseId = expenseId;
      if (predictedCategory) feedbackInput.predictedCategory = predictedCategory;
      if (actualCategory) feedbackInput.actualCategory = actualCategory;

      await this.feedbackService.recordFeedback(userId, feedbackInput);

      res.status(201).json({ message: 'Feedback recorded successfully' });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/feedback/stats
   * Get feedback statistics
   */
  getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const days = parseInt(req.query['days'] as string) || 30;
      const stats = await this.feedbackService.getFeedbackStats(userId, days);

      res.status(200).json(stats);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/feedback/process
   * Process feedback and get insights
   */
  processFeedback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const insights = await this.feedbackService.processFeedback(userId);
      res.status(200).json(insights);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/feedback/training-data
   * Get training data for incremental learning
   */
  getTrainingData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const limit = parseInt(req.query['limit'] as string) || 1000;
      const trainingData = await this.feedbackService.getTrainingData(userId, limit);

      res.status(200).json({ data: trainingData, count: trainingData.length });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/feedback/retraining-check
   * Check if model retraining should be triggered
   */
  checkRetraining = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const result = await this.feedbackService.shouldTriggerRetraining(userId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
