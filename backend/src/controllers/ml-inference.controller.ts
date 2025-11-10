import { Request, Response, NextFunction } from 'express';
import { MlInferenceService } from '../services/ml-inference.service';
import { getPrismaClient } from '../config/database';

/**
 * ML Inference Controller
 *
 * Handles ML prediction and recommendation endpoints
 */
export class MlInferenceController {
  private mlService: MlInferenceService;

  constructor() {
    const prisma = getPrismaClient();
    this.mlService = new MlInferenceService(prisma);
  }

  /**
   * POST /api/ml/suggest-category
   * Suggest category for expense
   */
  suggestCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { merchant, amount, date, notes } = req.body as {
        merchant: string;
        amount: number;
        date?: string;
        notes?: string;
      };

      if (!merchant || !amount) {
        res.status(400).json({ message: 'Missing required fields: merchant, amount' });
        return;
      }

      const expenseData: { merchant: string; amount: number; date?: Date; notes?: string } = {
        merchant,
        amount,
      };
      if (date) expenseData.date = new Date(date);
      if (notes) expenseData.notes = notes;

      const suggestion = await this.mlService.predictCategory(userId, expenseData);

      res.status(200).json(suggestion);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/ml/detect-errors
   * Detect potential errors in expense data
   */
  detectErrors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { merchant, amount, categoryId, date } = req.body as {
        merchant: string;
        amount: number;
        categoryId?: string;
        date: string;
      };

      if (!merchant || !amount || !date) {
        res.status(400).json({ message: 'Missing required fields: merchant, amount, date' });
        return;
      }

      const expenseData: { merchant: string; amount: number; categoryId?: string; date: Date } = {
        merchant,
        amount,
        date: new Date(date),
      };
      if (categoryId) expenseData.categoryId = categoryId;

      const detection = await this.mlService.detectErrors(userId, expenseData);

      res.status(200).json(detection);
    } catch (error) {
      next(error);
    }
  };
}
