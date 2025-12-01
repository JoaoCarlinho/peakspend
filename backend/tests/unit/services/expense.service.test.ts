/**
 * Unit tests for ExpenseService
 * Story 6-1
 */

import { ExpenseService } from '../../../src/services/expense.service';
import { PrismaClient } from '../../../src/generated/prisma/client';

// Mock Prisma
jest.mock('../../../src/generated/prisma/client');

describe('ExpenseService', () => {
  let expenseService: ExpenseService;
  let prismaMock: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    prismaMock = {
      expense: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaClient>;
    expenseService = new ExpenseService(prismaMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createExpense', () => {
    it('should create an expense successfully', async () => {
      const mockExpense = {
        id: '123',
        userId: 'user-1',
        date: new Date('2024-01-01'),
        amount: 50.0,
        merchant: 'Starbucks',
        categoryId: 'cat-1',
        notes: 'Coffee',
        receiptUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prismaMock.expense.create as jest.Mock).mockResolvedValue(mockExpense);

      const result = await expenseService.createExpense('user-1', {
        date: new Date('2024-01-01'),
        amount: 50.0,
        merchant: 'Starbucks',
        categoryId: 'cat-1',
        notes: 'Coffee',
      });

      expect(result).toEqual(mockExpense);
      expect(prismaMock.expense.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('getExpenses', () => {
    it('should return user expenses with pagination', async () => {
      const mockExpenses = [
        {
          id: '1',
          userId: 'user-1',
          date: new Date('2024-01-01'),
          amount: 50.0,
          merchant: 'Store A',
          categoryId: 'cat-1',
          notes: null,
          receiptUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          category: { id: 'cat-1', name: 'Food', color: '#ff0000', userId: 'user-1', isDefault: false, createdAt: new Date() },
        },
      ];

      (prismaMock.expense.findMany as jest.Mock).mockResolvedValue(mockExpenses);
      (prismaMock.expense.count as jest.Mock).mockResolvedValue(1);

      const result = await expenseService.getExpenses('user-1', { page: 1, limit: 10 });

      expect(result.data).toEqual(mockExpenses);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });
  });

  describe('deleteExpense', () => {
    it('should delete expense and return true', async () => {
      (prismaMock.expense.findFirst as jest.Mock).mockResolvedValue({ id: '123', userId: 'user-1', receiptUrl: null });
      (prismaMock.expense.delete as jest.Mock).mockResolvedValue({ id: '123' });

      const result = await expenseService.deleteExpense('123', 'user-1');

      expect(result).toBe(true);
      expect(prismaMock.expense.delete).toHaveBeenCalledWith({
        where: { id: '123' },
      });
    });

    it('should return false if expense not found', async () => {
      (prismaMock.expense.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await expenseService.deleteExpense('999', 'user-1');

      expect(result).toBe(false);
    });
  });
});
