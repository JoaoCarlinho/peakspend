import { z } from 'zod';

/**
 * Validation schemas for expense endpoints
 *
 * Uses Zod for runtime type validation with TypeScript type inference
 */

/**
 * Schema for creating a new expense
 */
export const createExpenseSchema = z.object({
  body: z.object({
    date: z.string().datetime({ message: 'Invalid ISO datetime format' }),
    amount: z
      .number()
      .positive({ message: 'Amount must be positive' })
      .finite({ message: 'Amount must be a finite number' }),
    merchant: z.string().min(1, 'Merchant name is required'),
    categoryId: z.string().uuid('Invalid category ID format').optional(),
    notes: z.string().optional(),
    receiptUrl: z.string().url('Invalid receipt URL format').optional(),
  }),
});

/**
 * Schema for updating an expense
 * All fields are optional
 */
export const updateExpenseSchema = z.object({
  body: z.object({
    date: z.string().datetime({ message: 'Invalid ISO datetime format' }).optional(),
    amount: z
      .number()
      .positive({ message: 'Amount must be positive' })
      .finite({ message: 'Amount must be a finite number' })
      .optional(),
    merchant: z.string().min(1, 'Merchant name is required').optional(),
    categoryId: z.string().uuid('Invalid category ID format').nullable().optional(),
    notes: z.string().nullable().optional(),
    receiptUrl: z.string().url('Invalid receipt URL format').nullable().optional(),
  }),
});

/**
 * Schema for expense list query parameters
 */
export const listExpensesQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1).catch(1),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(100, 'Limit cannot exceed 100')
      .default(50)
      .catch(50),
    sortBy: z.enum(['date', 'amount', 'merchant', 'category']).default('date').catch('date'),
    sortOrder: z.enum(['asc', 'desc']).default('desc').catch('desc'),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    categoryId: z.string().uuid().optional(),
    merchantSearch: z.string().optional(),
    minAmount: z.coerce.number().positive().optional(),
    maxAmount: z.coerce.number().positive().optional(),
    search: z.string().optional(),
  }),
});

/**
 * Schema for UUID parameters (for :id routes)
 */
export const uuidParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid expense ID format'),
  }),
});

// Export TypeScript types inferred from schemas
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>['body'];
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>['body'];
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>['query'];
