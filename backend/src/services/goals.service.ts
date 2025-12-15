import { getPrismaClient } from '../config/database';
import { GoalType, GoalStatus, Prisma } from '../generated/prisma';
import { auditLogger } from '../audit';
import { securityConfigService } from '../security/securityConfig.service';
import logger from '../config/logger';

const prisma = getPrismaClient();

/**
 * Goals Service - Secure Implementation
 *
 * Manages budget goals with strict tenant isolation.
 * All operations verify userId to ensure users can only access their own data.
 *
 * Security Controls:
 * - Tenant isolation: All queries filter by userId
 * - Audit logging: Goal creation/updates are logged
 * - Input validation: Goal data is validated before storage
 */

export interface CreateGoalInput {
  description: string;
  goalType?: GoalType | undefined;
  category?: string | undefined;
  targetAmount: number;
  deadline: Date | string;
  startDate?: Date | string | undefined;
}

export interface UpdateGoalInput {
  description?: string | undefined;
  targetAmount?: number | undefined;
  currentAmount?: number | undefined;
  deadline?: Date | string | undefined;
  status?: GoalStatus | undefined;
  category?: string | undefined;
}

/**
 * Create a new budget goal
 * SECURE: Goal is bound to authenticated user
 */
export async function createGoal(
  userId: string,
  input: CreateGoalInput
): Promise<{ id: string; description: string; goalType: GoalType; targetAmount: number }> {
  // Validate input
  if (!input.description || input.description.trim().length === 0) {
    throw new Error('Goal description is required');
  }
  if (input.targetAmount <= 0) {
    throw new Error('Target amount must be positive');
  }

  const deadline = new Date(input.deadline);
  if (isNaN(deadline.getTime())) {
    throw new Error('Invalid deadline date');
  }

  const startDate = input.startDate ? new Date(input.startDate) : new Date();

  const goal = await prisma.budgetGoal.create({
    data: {
      userId,
      description: input.description.trim(),
      goalType: input.goalType || 'savings',
      category: input.category || null,
      targetAmount: new Prisma.Decimal(input.targetAmount),
      currentAmount: new Prisma.Decimal(0),
      startDate,
      deadline,
      status: 'active',
    },
  });

  // Audit logging
  if (securityConfigService.isFeatureEnabled('AUDIT_LOGGING_ENABLED')) {
    await auditLogger.logSecurityEvent({
      eventType: 'GOAL_CREATED',
      severity: 'LOW',
      userId,
      details: {
        goalId: goal.id,
        goalType: goal.goalType,
        targetAmount: input.targetAmount,
      },
    });
  }

  logger.info('Goal created', {
    event: 'GOAL_CREATED',
    userId,
    goalId: goal.id,
  });

  return {
    id: goal.id,
    description: goal.description,
    goalType: goal.goalType,
    targetAmount: Number(goal.targetAmount),
  };
}

/**
 * Get all goals for a user
 * SECURE: Only fetches goals belonging to authenticated user
 */
export async function getGoals(
  userId: string,
  status?: GoalStatus
): Promise<
  Array<{
    id: string;
    description: string;
    goalType: GoalType;
    category: string | null;
    targetAmount: number;
    currentAmount: number;
    startDate: Date;
    deadline: Date;
    status: GoalStatus;
    createdAt: Date;
    progress: number;
  }>
> {
  const where: Prisma.BudgetGoalWhereInput = { userId };
  if (status) {
    where.status = status;
  }

  const goals = await prisma.budgetGoal.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return goals.map((g) => {
    const target = Number(g.targetAmount);
    const current = Number(g.currentAmount);
    const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;

    return {
      id: g.id,
      description: g.description,
      goalType: g.goalType,
      category: g.category,
      targetAmount: target,
      currentAmount: current,
      startDate: g.startDate,
      deadline: g.deadline,
      status: g.status,
      createdAt: g.createdAt,
      progress: Math.round(progress * 10) / 10,
    };
  });
}

/**
 * Get a single goal by ID
 * SECURE: Verifies goal belongs to authenticated user
 */
export async function getGoalById(
  userId: string,
  goalId: string
): Promise<{
  id: string;
  description: string;
  goalType: GoalType;
  category: string | null;
  targetAmount: number;
  currentAmount: number;
  startDate: Date;
  deadline: Date;
  status: GoalStatus;
  createdAt: Date;
  progress: number;
} | null> {
  const goal = await prisma.budgetGoal.findFirst({
    where: {
      id: goalId,
      userId, // SECURE: Tenant isolation
    },
  });

  if (!goal) {
    return null;
  }

  const target = Number(goal.targetAmount);
  const current = Number(goal.currentAmount);
  const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;

  return {
    id: goal.id,
    description: goal.description,
    goalType: goal.goalType,
    category: goal.category,
    targetAmount: target,
    currentAmount: current,
    startDate: goal.startDate,
    deadline: goal.deadline,
    status: goal.status,
    createdAt: goal.createdAt,
    progress: Math.round(progress * 10) / 10,
  };
}

/**
 * Update a goal
 * SECURE: Verifies goal belongs to authenticated user
 */
export async function updateGoal(
  userId: string,
  goalId: string,
  input: UpdateGoalInput
): Promise<{ success: boolean; message: string }> {
  // First verify ownership
  const existing = await prisma.budgetGoal.findFirst({
    where: {
      id: goalId,
      userId, // SECURE: Tenant isolation
    },
  });

  if (!existing) {
    return { success: false, message: 'Goal not found' };
  }

  // Build update data
  const updateData: Prisma.BudgetGoalUpdateInput = {};

  if (input.description !== undefined) {
    updateData.description = input.description.trim();
  }
  if (input.targetAmount !== undefined) {
    if (input.targetAmount <= 0) {
      return { success: false, message: 'Target amount must be positive' };
    }
    updateData.targetAmount = new Prisma.Decimal(input.targetAmount);
  }
  if (input.currentAmount !== undefined) {
    if (input.currentAmount < 0) {
      return { success: false, message: 'Current amount cannot be negative' };
    }
    updateData.currentAmount = new Prisma.Decimal(input.currentAmount);
  }
  if (input.deadline !== undefined) {
    const deadline = new Date(input.deadline);
    if (isNaN(deadline.getTime())) {
      return { success: false, message: 'Invalid deadline date' };
    }
    updateData.deadline = deadline;
  }
  if (input.status !== undefined) {
    updateData.status = input.status;
  }
  if (input.category !== undefined) {
    updateData.category = input.category || null;
  }

  await prisma.budgetGoal.update({
    where: { id: goalId },
    data: updateData,
  });

  // Audit logging
  if (securityConfigService.isFeatureEnabled('AUDIT_LOGGING_ENABLED')) {
    await auditLogger.logSecurityEvent({
      eventType: 'GOAL_UPDATED',
      severity: 'LOW',
      userId,
      details: {
        goalId,
        updatedFields: Object.keys(updateData),
      },
    });
  }

  logger.info('Goal updated', {
    event: 'GOAL_UPDATED',
    userId,
    goalId,
  });

  return { success: true, message: 'Goal updated successfully' };
}

/**
 * Update goal progress (current amount)
 * SECURE: Verifies goal belongs to authenticated user
 */
export async function updateProgress(
  userId: string,
  goalId: string,
  currentAmount: number
): Promise<{ success: boolean; progress: number; message: string }> {
  if (currentAmount < 0) {
    return { success: false, progress: 0, message: 'Amount cannot be negative' };
  }

  const result = await updateGoal(userId, goalId, { currentAmount });
  if (!result.success) {
    return { success: false, progress: 0, message: result.message };
  }

  const goal = await getGoalById(userId, goalId);
  return {
    success: true,
    progress: goal?.progress || 0,
    message: 'Progress updated',
  };
}

/**
 * Delete a goal
 * SECURE: Verifies goal belongs to authenticated user
 */
export async function deleteGoal(
  userId: string,
  goalId: string
): Promise<{ success: boolean; message: string }> {
  // First verify ownership
  const existing = await prisma.budgetGoal.findFirst({
    where: {
      id: goalId,
      userId, // SECURE: Tenant isolation
    },
  });

  if (!existing) {
    return { success: false, message: 'Goal not found' };
  }

  await prisma.budgetGoal.delete({
    where: { id: goalId },
  });

  // Audit logging
  if (securityConfigService.isFeatureEnabled('AUDIT_LOGGING_ENABLED')) {
    await auditLogger.logSecurityEvent({
      eventType: 'GOAL_DELETED',
      severity: 'LOW',
      userId,
      details: { goalId },
    });
  }

  logger.info('Goal deleted', {
    event: 'GOAL_DELETED',
    userId,
    goalId,
  });

  return { success: true, message: 'Goal deleted successfully' };
}

/**
 * Get goals context for coaching mode
 * Returns formatted string for LLM context
 */
export async function getGoalsForCoachingContext(userId: string): Promise<string> {
  const goals = await getGoals(userId, 'active');

  if (goals.length === 0) {
    return '';
  }

  const goalsList = goals
    .map((g) => `- ${g.description}: $${g.currentAmount.toFixed(2)} / $${g.targetAmount.toFixed(2)} (${g.progress}%)`)
    .join('\n');

  return `\n\nUser's Active Budget Goals:\n${goalsList}`;
}

/**
 * Parse and create goal from chat message
 * Extracts goal information from natural language
 */
export async function parseAndCreateGoalFromChat(
  userId: string,
  message: string
): Promise<{ created: boolean; goalId?: string; description?: string }> {
  const lowerMessage = message.toLowerCase();

  // Pattern: "save $X" or "save X dollars"
  const saveMatch = lowerMessage.match(/save\s+\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  if (saveMatch && saveMatch[1]) {
    const amount = parseFloat(saveMatch[1].replace(',', ''));
    const result = await createGoal(userId, {
      description: `Save $${amount.toFixed(2)}`,
      goalType: 'savings',
      targetAmount: amount,
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });
    return { created: true, goalId: result.id, description: result.description };
  }

  // Pattern: "spend less than $X on [category]"
  const spendMatch = lowerMessage.match(/spend\s+(?:less\s+than\s+)?\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?:on\s+)?(\w+)/);
  if (spendMatch && spendMatch[1] && spendMatch[2]) {
    const amount = parseFloat(spendMatch[1].replace(',', ''));
    const category = spendMatch[2];
    const result = await createGoal(userId, {
      description: `Spend less than $${amount.toFixed(2)} on ${category}`,
      goalType: 'spending_limit',
      category,
      targetAmount: amount,
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });
    return { created: true, goalId: result.id, description: result.description };
  }

  return { created: false };
}

export const goalsService = {
  createGoal,
  getGoals,
  getGoalById,
  updateGoal,
  updateProgress,
  deleteGoal,
  getGoalsForCoachingContext,
  parseAndCreateGoalFromChat,
};
