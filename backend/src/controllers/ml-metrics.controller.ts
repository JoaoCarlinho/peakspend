import { Request, Response, NextFunction } from 'express';
import { MlMetricsService } from '../services/ml-metrics.service';
import { getPrismaClient } from '../config/database';

/**
 * ML Metrics Controller
 *
 * Handles ML performance metrics and dashboard endpoints
 * Story 5-5, 5-6, 5-7
 */
export class MlMetricsController {
  private metricsService: MlMetricsService;

  constructor() {
    const prisma = getPrismaClient();
    this.metricsService = new MlMetricsService(prisma);
  }

  /**
   * GET /api/ml-metrics/accuracy
   * Get accuracy metrics
   */
  getAccuracy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const days = parseInt(req.query['days'] as string) || 30;
      const metrics = await this.metricsService.calculateAccuracy(userId, days);

      // Convert Map to object for JSON serialization
      const categoryAccuracyObj: Record<string, number> = {};
      metrics.categoryAccuracy.forEach((accuracy, category) => {
        categoryAccuracyObj[category] = accuracy;
      });

      res.status(200).json({
        overallAccuracy: metrics.overallAccuracy,
        categoryAccuracy: categoryAccuracyObj,
        predictionConfidenceAvg: metrics.predictionConfidenceAvg,
        totalPredictions: metrics.totalPredictions,
        correctPredictions: metrics.correctPredictions,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/ml-metrics/dashboard
   * Get performance dashboard data
   */
  getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const dashboard = await this.metricsService.getPerformanceDashboard(userId);
      res.status(200).json(dashboard);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/ml-metrics/improvement
   * Get improvement metrics showing ML learning progress
   */
  getImprovement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const improvement = await this.metricsService.getImprovementMetrics(userId);
      res.status(200).json(improvement);
    } catch (error) {
      next(error);
    }
  };
}
