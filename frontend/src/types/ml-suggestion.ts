export interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
  confidence: number;
  reasoning: string;
  source: 'ml' | 'pattern' | 'rule';
}

export interface SuggestCategoryRequest {
  merchant: string;
  amount: number;
  date: string;
  notes?: string;
}

export interface SuggestCategoryResponse {
  suggestions: CategorySuggestion[];
  topSuggestion: CategorySuggestion | null;
}

export interface ExpenseError {
  field: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  suggestion?: string;
}

export interface DetectErrorsRequest {
  merchant: string;
  amount: number;
  date: string;
  categoryId?: string;
}

export interface DetectErrorsResponse {
  errors: ExpenseError[];
  hasErrors: boolean;
}
