import { useQuery } from '@tanstack/react-query';
import { mlSuggestionService } from '../services/mlSuggestionService';
import type { SuggestCategoryRequest, DetectErrorsRequest } from '../types/ml-suggestion';

export function useCategorySuggestions(
  request: SuggestCategoryRequest | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['ml-suggestions', 'category', request],
    queryFn: () => (request ? mlSuggestionService.suggestCategory(request) : null),
    enabled: options?.enabled !== false && request !== null && request.merchant.length > 0,
    staleTime: 60000, // Cache for 1 minute
  });
}

export function useErrorDetection(
  request: DetectErrorsRequest | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['ml-suggestions', 'errors', request],
    queryFn: () => (request ? mlSuggestionService.detectErrors(request) : null),
    enabled: options?.enabled !== false && request !== null && request.merchant.length > 0,
    staleTime: 60000,
  });
}
