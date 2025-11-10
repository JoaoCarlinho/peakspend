/**
 * React Query hooks for submitting ML feedback.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from './useAuth';

const ML_API_BASE = import.meta.env.VITE_ML_API_BASE_URL || 'http://localhost:8000';

interface FeedbackSubmission {
  expense_id: string;
  merchant: string;
  amount: number;
  date: string;
  notes?: string;
  predicted_category: string;
  confidence: number;
  model_version?: string;
  feedback_type: 'accepted' | 'corrected' | 'rejected';
  actual_category?: string;
  feedback_notes?: string;
}

interface FeedbackResponse {
  feedback_id: string;
  user_id: string;
  expense_id: string;
  feedback_type: string;
  timestamp: string;
  message: string;
}

/**
 * Hook to submit ML feedback.
 */
export function useSubmitFeedback() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (feedback: FeedbackSubmission): Promise<FeedbackResponse> => {
      if (!user?.id) throw new Error('User not authenticated');

      const response = await axios.post<FeedbackResponse>(
        `${ML_API_BASE}/api/ml/feedback/submit`,
        {
          user_id: user.id,
          ...feedback,
        }
      );

      return response.data;
    },
    onSuccess: () => {
      // Invalidate ML-related queries to refresh stats
      queryClient.invalidateQueries({ queryKey: ['ml-summary'] });
      queryClient.invalidateQueries({ queryKey: ['ml-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['feedback-stats'] });
    },
  });
}

/**
 * Convenience hook to accept an ML suggestion.
 */
export function useAcceptSuggestion() {
  const submitFeedback = useSubmitFeedback();

  return {
    acceptSuggestion: (
      expenseId: string,
      merchant: string,
      amount: number,
      date: string,
      predictedCategory: string,
      confidence: number,
      notes?: string,
      modelVersion?: string
    ) => {
      return submitFeedback.mutate({
        expense_id: expenseId,
        merchant,
        amount,
        date,
        notes,
        predicted_category: predictedCategory,
        confidence,
        model_version: modelVersion,
        feedback_type: 'accepted',
      });
    },
    isLoading: submitFeedback.isPending,
    error: submitFeedback.error,
  };
}

/**
 * Convenience hook to correct an ML suggestion.
 */
export function useCorrectSuggestion() {
  const submitFeedback = useSubmitFeedback();

  return {
    correctSuggestion: (
      expenseId: string,
      merchant: string,
      amount: number,
      date: string,
      predictedCategory: string,
      actualCategory: string,
      confidence: number,
      notes?: string,
      modelVersion?: string
    ) => {
      return submitFeedback.mutate({
        expense_id: expenseId,
        merchant,
        amount,
        date,
        notes,
        predicted_category: predictedCategory,
        confidence,
        model_version: modelVersion,
        feedback_type: 'corrected',
        actual_category: actualCategory,
      });
    },
    isLoading: submitFeedback.isPending,
    error: submitFeedback.error,
  };
}
