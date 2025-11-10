import { PrismaClient, Expense, Prisma } from '../generated/prisma/client';
import {
  CreateExpenseInput,
  UpdateExpenseInput,
  ListExpensesQuery,
} from '../validation/expense.validation';
import { S3Service } from './s3.service';
import logger from '../config/logger';

/**
 * Expense Service
 *
 * Handles all business logic for expense management
 * Uses Prisma Client for database operations
 */
export class ExpenseService {
  private s3Service: S3Service;

  constructor(private prisma: PrismaClient) {
    this.s3Service = new S3Service();
  }

  /**
   * Add signed URL to expense if it has a receipt
   */
  private async addSignedUrl(expense: Expense): Promise<Expense & { signedReceiptUrl?: string }> {
    if (expense.receiptUrl) {
      const signedUrl = await this.s3Service.getSignedUrl(expense.receiptUrl);
      return { ...expense, signedReceiptUrl: signedUrl };
    }
    return expense;
  }

  /**
   * Create a new expense for a user
   *
   * @param userId - ID of the user creating the expense
   * @param data - Expense data from request
   * @returns Created expense with signed receipt URL if applicable
   */
  async createExpense(userId: string, data: CreateExpenseInput): Promise<Expense & { signedReceiptUrl?: string }> {
    const expense = await this.prisma.expense.create({
      data: {
        userId,
        date: new Date(data.date),
        amount: data.amount,
        merchant: data.merchant,
        categoryId: data.categoryId || null,
        notes: data.notes || null,
        receiptUrl: data.receiptUrl || null,
      },
      include: {
        category: true,
      },
    });
    return this.addSignedUrl(expense);
  }

  /**
   * Get a single expense by ID
   *
   * Only returns expense if it belongs to the specified user
   *
   * @param id - Expense ID
   * @param userId - User ID for ownership check
   * @returns Expense with signed receipt URL or null if not found/not owned
   */
  async getExpenseById(id: string, userId: string): Promise<(Expense & { signedReceiptUrl?: string }) | null> {
    const expense = await this.prisma.expense.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        category: true,
      },
    });
    if (!expense) return null;
    return this.addSignedUrl(expense);
  }

  /**
   * Get paginated list of expenses for a user
   *
   * Supports filtering, sorting, and search
   *
   * @param userId - User ID
   * @param query - Query parameters for pagination, filtering, sorting
   * @returns Object with expenses array and pagination metadata
   */
  async getExpenses(userId: string, query: ListExpensesQuery) {
    const {
      page,
      limit,
      sortBy,
      sortOrder,
      dateFrom,
      dateTo,
      categoryId,
      merchantSearch,
      minAmount,
      maxAmount,
      search,
    } = query;

    // Build Prisma where clause
    const where: Prisma.ExpenseWhereInput = {
      userId,
    };

    // Date range filter
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) {
        where.date.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.date.lte = new Date(dateTo);
      }
    }

    // Category filter
    if (categoryId) {
      where.categoryId = categoryId;
    }

    // Amount range filter
    if (minAmount !== undefined || maxAmount !== undefined) {
      where.amount = {};
      if (minAmount !== undefined) {
        where.amount.gte = minAmount;
      }
      if (maxAmount !== undefined) {
        where.amount.lte = maxAmount;
      }
    }

    // Merchant search filter
    if (merchantSearch) {
      where.merchant = {
        contains: merchantSearch,
        mode: 'insensitive',
      };
    }

    // General search filter (merchant OR notes)
    if (search) {
      where.OR = [
        {
          merchant: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          notes: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    // Build Prisma orderBy clause
    const orderBy: Prisma.ExpenseOrderByWithRelationInput = {};
    if (sortBy === 'category') {
      // Sort by category name
      orderBy.category = {
        name: sortOrder,
      };
    } else {
      orderBy[sortBy] = sortOrder;
    }

    // Execute queries in parallel
    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: true,
        },
      }),
      this.prisma.expense.count({ where }),
    ]);

    // Add signed URLs to expenses with receipts
    const expensesWithSignedUrls = await Promise.all(
      expenses.map((expense) => this.addSignedUrl(expense))
    );

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);

    return {
      data: expensesWithSignedUrls,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Update an existing expense
   *
   * Only allows updating if expense belongs to the specified user
   *
   * @param id - Expense ID
   * @param userId - User ID for ownership check
   * @param data - Expense data to update
   * @returns Updated expense with signed receipt URL or null if not found/not owned
   */
  async updateExpense(
    id: string,
    userId: string,
    data: UpdateExpenseInput
  ): Promise<(Expense & { signedReceiptUrl?: string }) | null> {
    // Check if expense exists and belongs to user
    const existing = await this.prisma.expense.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return null;
    }

    // Update expense - only include fields that are provided
    const updateData: Prisma.ExpenseUpdateInput = {};
    if (data.date) updateData.date = new Date(data.date);
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.merchant !== undefined) updateData.merchant = data.merchant;
    if (data.categoryId !== undefined) {
      // Use Prisma relation syntax for categoryId
      if (data.categoryId === null) {
        updateData.category = { disconnect: true };
      } else {
        updateData.category = { connect: { id: data.categoryId } };
      }
    }
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.receiptUrl !== undefined) updateData.receiptUrl = data.receiptUrl;

    const updated = await this.prisma.expense.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
      },
    });
    return this.addSignedUrl(updated);
  }

  /**
   * Delete an expense
   *
   * Only allows deleting if expense belongs to the specified user
   * Also deletes associated receipt from S3
   *
   * @param id - Expense ID
   * @param userId - User ID for ownership check
   * @returns True if deleted, false if not found/not owned
   */
  async deleteExpense(id: string, userId: string): Promise<boolean> {
    // Check if expense exists and belongs to user
    const existing = await this.prisma.expense.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return false;
    }

    // Delete receipt from S3 if exists
    if (existing.receiptUrl) {
      try {
        await this.s3Service.deleteFile(existing.receiptUrl);
      } catch (error) {
        logger.error('Failed to delete receipt from S3', {
          error,
          expenseId: id,
          receiptUrl: existing.receiptUrl,
        });
        // Continue with expense deletion even if S3 delete fails
      }
    }

    // Delete expense
    await this.prisma.expense.delete({
      where: { id },
    });

    return true;
  }

  /**
   * Export expenses as CSV
   *
   * Returns all expenses matching the filters (no pagination)
   * Formats data as RFC 4180 compliant CSV
   *
   * @param userId - User ID for filtering expenses
   * @param query - Filter parameters (dateFrom, dateTo, categoryId, etc.)
   * @returns CSV string
   */
  async exportExpensesAsCSV(userId: string, query: ListExpensesQuery): Promise<string> {
    const {
      dateFrom,
      dateTo,
      categoryId,
      merchantSearch,
      minAmount,
      maxAmount,
      search,
    } = query;

    // Build where clause (same as list method but without pagination)
    const where: Prisma.ExpenseWhereInput = {
      userId,
    };

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) {
        where.date.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.date.lte = new Date(dateTo);
      }
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.amount = {};
      if (minAmount !== undefined) {
        where.amount.gte = minAmount;
      }
      if (maxAmount !== undefined) {
        where.amount.lte = maxAmount;
      }
    }

    if (merchantSearch) {
      where.merchant = {
        contains: merchantSearch,
        mode: 'insensitive',
      };
    }

    if (search) {
      where.OR = [
        {
          merchant: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          notes: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    // Fetch all expenses (no limit)
    const expenses = await this.prisma.expense.findMany({
      where,
      orderBy: {
        date: 'desc',
      },
      include: {
        category: true,
      },
    });

    // Generate CSV
    const csvRows: string[] = [];

    // Header row
    csvRows.push('Date,Merchant,Amount,Category,Notes');

    // Data rows
    for (const expense of expenses) {
      const date = expense.date.toISOString().split('T')[0]; // YYYY-MM-DD
      const merchant = this.escapeCsvField(expense.merchant);
      const amount = expense.amount.toFixed(2);
      const category = expense.category ? this.escapeCsvField(expense.category.name) : '';
      const notes = expense.notes ? this.escapeCsvField(expense.notes) : '';

      csvRows.push(`${date},${merchant},${amount},${category},${notes}`);
    }

    return csvRows.join('\n');
  }

  /**
   * Escape CSV field according to RFC 4180
   *
   * Wraps fields in quotes if they contain commas, quotes, or newlines
   * Doubles internal quotes
   */
  private escapeCsvField(field: string): string {
    // Check if field needs escaping
    if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
      // Double any existing quotes and wrap in quotes
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }
}
