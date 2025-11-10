import { apiClient } from './api';
import type {
  SuggestCategoryRequest,
  SuggestCategoryResponse,
  DetectErrorsRequest,
  DetectErrorsResponse,
} from '../types/ml-suggestion';

export const mlSuggestionService = {
  async suggestCategory(data: SuggestCategoryRequest): Promise<SuggestCategoryResponse> {
    const response = await apiClient.post('/api/ml-inference/suggest-category', data);
    return response.data;
  },

  async detectErrors(data: DetectErrorsRequest): Promise<DetectErrorsResponse> {
    const response = await apiClient.post('/api/ml-inference/detect-errors', data);
    return response.data;
  },
};
