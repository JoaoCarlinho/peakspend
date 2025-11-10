export interface Expense {
  id: string;
  userId: string;
  merchant: string;
  amount: number;
  date: string;
  notes?: string | null;
  categoryId?: string | null;
  receiptUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  category?: {
    id: string;
    name: string;
    color?: string | null;
  } | null;
}

export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ExpenseListResponse {
  data: Expense[];
  pagination: PaginationMetadata;
}

export interface ExpenseFilters {
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

export interface ExpenseListParams {
  page?: number;
  limit?: number;
  sortBy?: 'date' | 'amount' | 'merchant' | 'category';
  sortOrder?: 'asc' | 'desc';
  filters?: ExpenseFilters;
}

export interface CreateExpenseInput {
  merchant: string;
  amount: number;
  date: string;
  notes?: string;
  categoryId?: string;
  receiptUrl?: string;
}

export interface UpdateExpenseInput {
  merchant?: string;
  amount?: number;
  date?: string;
  notes?: string;
  categoryId?: string;
  receiptUrl?: string;
}
