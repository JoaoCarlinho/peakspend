import { useQuery } from '@tanstack/react-query';
import { mlMetricsService } from '../services/mlMetricsService';

export function useAccuracyMetrics(days: number = 30) {
  return useQuery({
    queryKey: ['ml-metrics', 'accuracy', days],
    queryFn: () => mlMetricsService.getAccuracy(days),
    refetchInterval: 60000, // Refetch every minute
  });
}

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['ml-metrics', 'dashboard'],
    queryFn: () => mlMetricsService.getDashboard(),
    refetchInterval: 60000,
  });
}

export function useImprovementMetrics() {
  return useQuery({
    queryKey: ['ml-metrics', 'improvement'],
    queryFn: () => mlMetricsService.getImprovement(),
    refetchInterval: 60000,
  });
}
