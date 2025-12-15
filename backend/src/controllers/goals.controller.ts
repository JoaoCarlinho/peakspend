import { Request, Response, NextFunction } from 'express';
import { goalsService } from '../services/goals.service';
import { GoalStatus } from '../generated/prisma';
import logger from '../config/logger';

/**
 * Goals Controller - Secure Implementation
 *
 * Handles HTTP requests for budget goals.
 * Authentication is enforced at the route level via auth middleware.
 */

interface AuthenticatedRequest extends Request {
  userId?: string;
}

/**
 * Create a new goal
 * POST /api/goals
 */
export async function createGoal(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const { description, goalType, category, targetAmount, deadline, startDate } = req.body;

    if (!description || !targetAmount || !deadline) {
      res.status(400).json({
        error: 'Missing required fields: description, targetAmount, deadline',
        code: 'INVALID_INPUT',
      });
      return;
    }

    const goal = await goalsService.createGoal(userId, {
      description,
      goalType,
      category,
      targetAmount: Number(targetAmount),
      deadline,
      startDate,
    });

    res.status(201).json(goal);
  } catch (error) {
    logger.error('Failed to create goal', {
      event: 'GOAL_CREATE_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

/**
 * Get all goals for the authenticated user
 * GET /api/goals
 */
export async function getGoals(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const statusParam = req.query['status'] as string | undefined;
    const validStatuses: GoalStatus[] = ['active', 'achieved', 'failed', 'abandoned'];
    const status = validStatuses.includes(statusParam as GoalStatus)
      ? (statusParam as GoalStatus)
      : undefined;

    const goals = await goalsService.getGoals(userId, status);
    res.json({ goals });
  } catch (error) {
    logger.error('Failed to get goals', {
      event: 'GOALS_GET_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

/**
 * Get a single goal by ID
 * GET /api/goals/:id
 */
export async function getGoalById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const goalId = req.params['id'];
    if (!goalId) {
      res.status(400).json({ error: 'Goal ID is required', code: 'INVALID_ID' });
      return;
    }

    const goal = await goalsService.getGoalById(userId, goalId);
    if (!goal) {
      res.status(404).json({ error: 'Goal not found', code: 'NOT_FOUND' });
      return;
    }

    res.json(goal);
  } catch (error) {
    logger.error('Failed to get goal', {
      event: 'GOAL_GET_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

/**
 * Update a goal
 * PATCH /api/goals/:id
 */
export async function updateGoal(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const goalId = req.params['id'];
    if (!goalId) {
      res.status(400).json({ error: 'Goal ID is required', code: 'INVALID_ID' });
      return;
    }

    const { description, targetAmount, currentAmount, deadline, status, category } = req.body;

    const result = await goalsService.updateGoal(userId, goalId, {
      description,
      targetAmount: targetAmount !== undefined ? Number(targetAmount) : undefined,
      currentAmount: currentAmount !== undefined ? Number(currentAmount) : undefined,
      deadline,
      status,
      category,
    });

    if (!result.success) {
      res.status(404).json({ error: result.message, code: 'UPDATE_FAILED' });
      return;
    }

    res.json({ message: result.message });
  } catch (error) {
    logger.error('Failed to update goal', {
      event: 'GOAL_UPDATE_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

/**
 * Update goal progress
 * POST /api/goals/:id/progress
 */
export async function updateProgress(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const goalId = req.params['id'];
    if (!goalId) {
      res.status(400).json({ error: 'Goal ID is required', code: 'INVALID_ID' });
      return;
    }

    const { currentAmount } = req.body;
    if (currentAmount === undefined || currentAmount === null) {
      res.status(400).json({ error: 'currentAmount is required', code: 'INVALID_INPUT' });
      return;
    }

    const result = await goalsService.updateProgress(userId, goalId, Number(currentAmount));
    if (!result.success) {
      res.status(404).json({ error: result.message, code: 'UPDATE_FAILED' });
      return;
    }

    res.json({ progress: result.progress, message: result.message });
  } catch (error) {
    logger.error('Failed to update goal progress', {
      event: 'GOAL_PROGRESS_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

/**
 * Delete a goal
 * DELETE /api/goals/:id
 */
export async function deleteGoal(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const goalId = req.params['id'];
    if (!goalId) {
      res.status(400).json({ error: 'Goal ID is required', code: 'INVALID_ID' });
      return;
    }

    const result = await goalsService.deleteGoal(userId, goalId);
    if (!result.success) {
      res.status(404).json({ error: result.message, code: 'DELETE_FAILED' });
      return;
    }

    res.json({ message: result.message });
  } catch (error) {
    logger.error('Failed to delete goal', {
      event: 'GOAL_DELETE_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

export const goalsController = {
  createGoal,
  getGoals,
  getGoalById,
  updateGoal,
  updateProgress,
  deleteGoal,
};
