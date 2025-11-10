import { apiClient } from './api';
import type {
  Expense,
  ExpenseListResponse,
  ExpenseListParams,
  CreateExpenseInput,
  UpdateExpenseInput
} from '../types/expense';

export const expenseService = {
  /**
   * Get paginated list of expenses with filtering and sorting
   */
  async list(params: ExpenseListParams = {}): Promise<ExpenseListResponse> {
    const { page = 1, limit = 50, sortBy = 'date', sortOrder = 'desc', filters } = params;

    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      sortBy,
      sortOrder,
    });

    // Add filters
    if (filters) {
      if (filters.dateFrom) queryParams.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) queryParams.append('dateTo', filters.dateTo);
      if (filters.categoryId) queryParams.append('categoryId', filters.categoryId);
      if (filters.minAmount !== undefined) queryParams.append('minAmount', filters.minAmount.toString());
      if (filters.maxAmount !== undefined) queryParams.append('maxAmount', filters.maxAmount.toString());
      if (filters.search) queryParams.append('search', filters.search);
    }

    const response = await apiClient.get<ExpenseListResponse>(`/api/expenses?${queryParams}`);
    return response.data;
  },

  /**
   * Get a single expense by ID
   */
  async getById(id: string): Promise<Expense> {
    const response = await apiClient.get<Expense>(`/api/expenses/${id}`);
    return response.data;
  },

  /**
   * Create a new expense
   */
  async create(input: CreateExpenseInput): Promise<Expense> {
    const response = await apiClient.post<Expense>('/api/expenses', input);
    return response.data;
  },

  /**
   * Update an existing expense
   */
  async update(id: string, input: UpdateExpenseInput): Promise<Expense> {
    const response = await apiClient.patch<Expense>(`/api/expenses/${id}`, input);
    return response.data;
  },

  /**
   * Delete an expense
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/expenses/${id}`);
  },

  /**
   * Export expenses as CSV
   * Triggers browser download
   */
  async exportCSV(params: ExpenseListParams = {}): Promise<void> {
    const { filters } = params;

    const queryParams = new URLSearchParams();

    // Add filters
    if (filters) {
      if (filters.dateFrom) queryParams.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) queryParams.append('dateTo', filters.dateTo);
      if (filters.categoryId) queryParams.append('categoryId', filters.categoryId);
      if (filters.minAmount !== undefined) queryParams.append('minAmount', filters.minAmount.toString());
      if (filters.maxAmount !== undefined) queryParams.append('maxAmount', filters.maxAmount.toString());
      if (filters.search) queryParams.append('search', filters.search);
    }

    // Fetch CSV from backend
    const response = await apiClient.get(`/api/expenses/export?${queryParams}`, {
      responseType: 'blob',
    });

    // Create blob and download
    const blob = new Blob([response.data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `expenses_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};
