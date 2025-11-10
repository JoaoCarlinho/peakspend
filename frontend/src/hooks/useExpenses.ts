import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expenseService } from '../services/expenseService';
import type { ExpenseListParams, CreateExpenseInput, UpdateExpenseInput } from '../types/expense';

/**
 * React Query hook for fetching expenses list
 */
export function useExpenses(params: ExpenseListParams = {}) {
  return useQuery({
    queryKey: ['expenses', params],
    queryFn: () => expenseService.list(params),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * React Query hook for fetching a single expense
 */
export function useExpense(id: string) {
  return useQuery({
    queryKey: ['expense', id],
    queryFn: () => expenseService.getById(id),
    // Only fetch if ID exists and is not 'new' (for create mode)
    enabled: !!id && id !== 'new',
  });
}

/**
 * React Query mutation for creating an expense
 */
export function useCreateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateExpenseInput) => expenseService.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}

/**
 * React Query mutation for updating an expense
 */
export function useUpdateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateExpenseInput }) =>
      expenseService.update(id, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense', variables.id] });
    },
  });
}

/**
 * React Query mutation for deleting an expense
 */
export function useDeleteExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => expenseService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}
