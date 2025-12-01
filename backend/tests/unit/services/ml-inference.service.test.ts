/**
 * Unit tests for MlInferenceService
 * Story 6-2
 */

import { MlInferenceService } from '../../../src/services/ml-inference.service';
import { PrismaClient } from '../../../src/generated/prisma/client';

jest.mock('../../../src/generated/prisma/client');

describe('MlInferenceService', () => {
  let mlService: MlInferenceService;
  let prismaMock: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    prismaMock = {
      category: {
        findMany: jest.fn(),
      },
      expense: {
        findMany: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaClient>;
    mlService = new MlInferenceService(prismaMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('predictCategory', () => {
    it('should predict category based on merchant pattern', async () => {
      const mockCategories = [
        { id: 'cat-1', name: 'Groceries', color: '#00ff00', userId: 'user-1', isDefault: false, createdAt: new Date() },
        { id: 'cat-2', name: 'Transportation', color: '#0000ff', userId: 'user-1', isDefault: false, createdAt: new Date() },
      ];

      const mockExpenses = [
        {
          id: '1',
          userId: 'user-1',
          date: new Date(),
          amount: 45.0,
          merchant: 'Whole Foods',
          categoryId: 'cat-1',
          notes: null,
          receiptUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          category: { id: 'cat-1', name: 'Groceries', color: '#00ff00', userId: 'user-1', isDefault: false, createdAt: new Date() },
        },
      ];

      (prismaMock.category.findMany as jest.Mock).mockResolvedValue(mockCategories);
      (prismaMock.expense.findMany as jest.Mock).mockResolvedValue(mockExpenses);

      const result = await mlService.predictCategory('user-1', {
        merchant: 'Whole Foods Market',
        amount: 50.0,
        date: new Date(),
      });

      expect(result.topPrediction).toBeDefined();
      expect(result.topPrediction.categoryName).toBe('Groceries');
      expect(result.topPrediction.confidence).toBeGreaterThan(0.5);
      expect(result.predictions.length).toBeGreaterThan(0);
    });

    it('should return default prediction when no patterns match', async () => {
      const mockCategories = [
        { id: 'cat-1', name: 'Uncategorized', color: '#cccccc', userId: null, isDefault: true, createdAt: new Date() },
      ];

      (prismaMock.category.findMany as jest.Mock).mockResolvedValue(mockCategories);
      (prismaMock.expense.findMany as jest.Mock).mockResolvedValue([]);

      const result = await mlService.predictCategory('user-1', {
        merchant: 'Unknown Store',
        amount: 10.0,
      });

      expect(result.topPrediction.categoryName).toBe('Uncategorized');
      expect(result.topPrediction.confidence).toBeLessThan(0.5);
    });
  });

  describe('detectErrors', () => {
    it('should detect duplicate expenses', async () => {
      const mockDuplicates = [
        {
          id: '1',
          userId: 'user-1',
          date: new Date('2024-01-01'),
          amount: 50.0,
          merchant: 'Starbucks',
          categoryId: 'cat-1',
          notes: null,
          receiptUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (prismaMock.expense.findMany as jest.Mock).mockResolvedValue(mockDuplicates);

      const result = await mlService.detectErrors('user-1', {
        merchant: 'Starbucks',
        amount: 50.0,
        date: new Date('2024-01-01'),
      });

      expect(result.hasError).toBe(true);
      expect(result.errorType).toBe('duplicate');
      expect(result.message).toContain('duplicate');
    });

    it('should detect unusual amounts', async () => {
      const mockExpenses = Array(50).fill(null).map((_, i) => ({
        id: `${i}`,
        userId: 'user-1',
        date: new Date(),
        amount: 10.0 + Math.random() * 5,
        merchant: 'Store',
        categoryId: 'cat-1',
        notes: null,
        receiptUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      (prismaMock.expense.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // duplicate check
        .mockResolvedValueOnce(mockExpenses); // unusual amount check

      const result = await mlService.detectErrors('user-1', {
        merchant: 'Store',
        amount: 1000.0, // Way higher than average
        date: new Date(),
      });

      expect(result.hasError).toBe(true);
      expect(result.errorType).toBe('unusual_amount');
    });

    it('should return no error for valid expense', async () => {
      (prismaMock.expense.findMany as jest.Mock).mockResolvedValue([]);

      const result = await mlService.detectErrors('user-1', {
        merchant: 'Store',
        amount: 50.0,
        date: new Date(),
      });

      expect(result.hasError).toBe(false);
    });
  });
});
