import { apiClient } from './api';
import type {
  AccuracyMetrics,
  PerformanceDashboard,
  UserImprovementMetrics,
} from '../types/ml-metrics';

export const mlMetricsService = {
  /**
   * Get accuracy metrics for the last N days
   */
  async getAccuracy(days: number = 30): Promise<AccuracyMetrics> {
    const response = await apiClient.get(`/api/ml-metrics/accuracy?days=${days}`);
    return response.data;
  },

  /**
   * Get full performance dashboard data
   */
  async getDashboard(): Promise<PerformanceDashboard> {
    const response = await apiClient.get('/api/ml-metrics/dashboard');
    return response.data;
  },

  /**
   * Get improvement metrics showing learning progress
   */
  async getImprovement(): Promise<UserImprovementMetrics> {
    const response = await apiClient.get('/api/ml-metrics/improvement');
    return response.data;
  },
};
