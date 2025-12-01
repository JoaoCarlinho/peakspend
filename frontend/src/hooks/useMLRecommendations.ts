/**
 * React Query hooks for ML-powered category recommendations and error detection.
 */

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from './useAuth';

const ML_API_BASE = import.meta.env.VITE_ML_API_BASE_URL || 'http://localhost:8000';

interface MLPrediction {
  category: string;
  confidence: number;
  confidence_pct: number;
  confidence_level: string;
  explanation: string;
  detailed_explanation: string;
  contributing_factors: Array<{
    factor: string;
    description: string;
    importance: number;
  }>;
}

interface MLError {
  type: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion: string;
  metadata?: Record<string, unknown>;
}

interface RecommendationResponse {
  user_id: string;
  predictions: MLPrediction[];
  errors: MLError[];
  cold_start: boolean;
  inference_time_ms: number;
  feature_quality: number;
}

interface RecommendationRequest {
  merchant: string;
  amount: number;
  date?: string;
  notes?: string;
  category?: string;
  receipt_attached?: boolean;
  top_k?: number;
}

/**
 * Hook to get ML-powered category recommendations with confidence scores and explanations.
 *
 * @param request - Expense details for getting recommendations
 * @param options - Query options (enabled, debounce, etc.)
 */
export function useMLRecommendations(
  request: RecommendationRequest,
  options: {
    enabled?: boolean;
    debounceMs?: number;
  } = {}
) {
  const { user } = useAuth();
  const { enabled = true } = options;

  // Only fetch if merchant and amount are provided
  const shouldFetch = enabled && !!request.merchant && request.amount > 0 && !!user;

  return useQuery({
    queryKey: ['ml-recommendations', user?.id, request.merchant, request.amount, request.date],
    queryFn: async (): Promise<RecommendationResponse> => {
      if (!user?.id) throw new Error('User not authenticated');

      const response = await axios.post<RecommendationResponse>(
        `${ML_API_BASE}/api/ml/recommend`,
        {
          user_id: user.id,
          merchant: request.merchant,
          amount: request.amount,
          date: request.date || new Date().toISOString(),
          notes: request.notes,
          category: request.category,
          receipt_attached: request.receipt_attached || false,
          top_k: request.top_k || 3,
        }
      );

      return response.data;
    },
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}

/**
 * Transform ML API response to frontend CategorySuggestion format.
 */
export function transformMLRecommendations(data: RecommendationResponse | undefined) {
  if (!data) return { suggestions: [], errors: [], coldStart: false };

  const suggestions = data.predictions.map((pred, index) => ({
    categoryId: pred.category.toLowerCase().replace(/\s+/g, '-'), // Generate ID from category name
    categoryName: pred.category,
    confidence: pred.confidence,
    reasoning: pred.explanation,
    source: data.cold_start ? ('rule' as const) : ('ml' as const),
    confidenceLevel: pred.confidence_level,
    detailedExplanation: pred.detailed_explanation,
    contributingFactors: pred.contributing_factors,
    rank: index + 1,
  }));

  const errors = data.errors.map((err) => ({
    field: err.type,
    severity: err.severity === 'error' ? 'high' as const
      : err.severity === 'warning' ? 'medium' as const
        : 'low' as const,
    message: err.message,
    suggestion: err.suggestion,
    metadata: err.metadata,
  }));

  return {
    suggestions,
    errors,
    coldStart: data.cold_start,
    inferenceTimeMs: data.inference_time_ms,
    featureQuality: data.feature_quality,
  };
}

/**
 * Hook that combines recommendations with automatic transformation.
 */
export function useCategorySuggestions(
  merchant: string,
  amount: number,
  options: {
    date?: string;
    notes?: string;
    category?: string;
    enabled?: boolean;
  } = {}
) {
  const { data, isLoading, error, refetch } = useMLRecommendations(
    {
      merchant,
      amount,
      date: options.date,
      notes: options.notes,
      category: options.category,
    },
    {
      enabled: options.enabled,
      debounceMs: 500,
    }
  );

  const transformed = transformMLRecommendations(data);

  return {
    suggestions: transformed.suggestions,
    errors: transformed.errors,
    coldStart: transformed.coldStart,
    isLoading,
    error,
    refetch,
    metrics: {
      inferenceTimeMs: transformed.inferenceTimeMs,
      featureQuality: transformed.featureQuality,
    },
  };
}
