/**
 * Goals Service
 *
 * Handles communication with the budget goals API endpoints.
 * All operations are tenant-isolated at the backend.
 */

import { apiClient } from './api';

export type GoalType = 'savings' | 'spending_limit' | 'reduction';
export type GoalStatus = 'active' | 'achieved' | 'failed' | 'abandoned';

export interface BudgetGoal {
  id: string;
  description: string;
  goalType: GoalType;
  category?: string;
  targetAmount: number;
  currentAmount: number;
  startDate: string;
  deadline: string;
  status: GoalStatus;
  progressPercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalInput {
  description: string;
  goalType: GoalType;
  category?: string;
  targetAmount: number;
  deadline: string;
  currentAmount?: number;
}

export interface UpdateGoalInput {
  description?: string;
  targetAmount?: number;
  deadline?: string;
  status?: GoalStatus;
}

export interface ProgressUpdate {
  amount: number;
  note?: string;
}

/**
 * Create a new budget goal
 */
export async function createGoal(input: CreateGoalInput): Promise<BudgetGoal> {
  const response = await apiClient.post<{ goal: BudgetGoal }>('/api/goals', input);
  return response.data.goal;
}

/**
 * Get all goals for the current user
 */
export async function getGoals(): Promise<BudgetGoal[]> {
  const response = await apiClient.get<{ goals: BudgetGoal[] }>('/api/goals');
  return response.data.goals;
}

/**
 * Get a specific goal by ID
 */
export async function getGoalById(id: string): Promise<BudgetGoal> {
  const response = await apiClient.get<{ goal: BudgetGoal }>(`/api/goals/${id}`);
  return response.data.goal;
}

/**
 * Update a goal
 */
export async function updateGoal(id: string, input: UpdateGoalInput): Promise<BudgetGoal> {
  const response = await apiClient.patch<{ goal: BudgetGoal }>(`/api/goals/${id}`, input);
  return response.data.goal;
}

/**
 * Update goal progress
 */
export async function updateProgress(id: string, update: ProgressUpdate): Promise<BudgetGoal> {
  const response = await apiClient.post<{ goal: BudgetGoal }>(`/api/goals/${id}/progress`, update);
  return response.data.goal;
}

/**
 * Delete a goal
 */
export async function deleteGoal(id: string): Promise<void> {
  await apiClient.delete(`/api/goals/${id}`);
}

export const goalsService = {
  createGoal,
  getGoals,
  getGoalById,
  updateGoal,
  updateProgress,
  deleteGoal,
};
