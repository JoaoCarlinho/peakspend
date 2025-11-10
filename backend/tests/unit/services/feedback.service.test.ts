/**
 * Unit tests for FeedbackService
 * Story 6-2
 */

import { FeedbackService } from '../../../src/services/feedback.service';
import { PrismaClient, FeedbackType } from '../../../src/generated/prisma/client';

jest.mock('../../../src/generated/prisma/client');

describe('FeedbackService', () => {
  let feedbackService: FeedbackService;
  let prismaMock: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    prismaMock = new PrismaClient() as jest.Mocked<PrismaClient>;
    feedbackService = new FeedbackService(prismaMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordFeedback', () => {
    it('should record ACCEPT feedback successfully', async () => {
      (prismaMock.trainingData.create as jest.Mock).mockResolvedValue({
        id: '123',
        userId: 'user-1',
        expenseId: 'exp-1',
        predictedCategory: 'Groceries',
        actualCategory: 'Groceries',
        feedbackType: 'ACCEPT',
        timestamp: new Date(),
      });

      await feedbackService.recordFeedback('user-1', {
        expenseId: 'exp-1',
        predictedCategory: 'Groceries',
        actualCategory: 'Groceries',
        feedbackType: FeedbackType.ACCEPT,
      });

      expect(prismaMock.trainingData.create).toHaveBeenCalledTimes(1);
    });

    it('should record REJECT feedback with correction', async () => {
      (prismaMock.trainingData.create as jest.Mock).mockResolvedValue({
        id: '124',
        userId: 'user-1',
        expenseId: 'exp-1',
        predictedCategory: 'Transportation',
        actualCategory: 'Groceries',
        feedbackType: 'REJECT',
        timestamp: new Date(),
      });

      await feedbackService.recordFeedback('user-1', {
        expenseId: 'exp-1',
        predictedCategory: 'Transportation',
        actualCategory: 'Groceries',
        feedbackType: FeedbackType.REJECT,
      });

      expect(prismaMock.trainingData.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('getFeedbackStats', () => {
    it('should calculate feedback statistics correctly', async () => {
      const mockFeedback = [
        { id: '1', userId: 'user-1', expenseId: null, predictedCategory: null, actualCategory: null, feedbackType: 'ACCEPT' as FeedbackType, timestamp: new Date() },
        { id: '2', userId: 'user-1', expenseId: null, predictedCategory: null, actualCategory: null, feedbackType: 'ACCEPT' as FeedbackType, timestamp: new Date() },
        { id: '3', userId: 'user-1', expenseId: null, predictedCategory: null, actualCategory: null, feedbackType: 'REJECT' as FeedbackType, timestamp: new Date() },
        { id: '4', userId: 'user-1', expenseId: null, predictedCategory: null, actualCategory: null, feedbackType: 'MANUAL' as FeedbackType, timestamp: new Date() },
      ];

      (prismaMock.trainingData.findMany as jest.Mock).mockResolvedValue(mockFeedback);

      const stats = await feedbackService.getFeedbackStats('user-1', 30);

      expect(stats.totalFeedback).toBe(4);
      expect(stats.acceptRate).toBe(0.5); // 2/4
      expect(stats.rejectRate).toBe(0.25); // 1/4
      expect(stats.manualRate).toBe(0.25); // 1/4
      expect(stats.recentAccuracy).toBe(0.5); // accepts / total
    });

    it('should return zeros when no feedback exists', async () => {
      (prismaMock.trainingData.findMany as jest.Mock).mockResolvedValue([]);

      const stats = await feedbackService.getFeedbackStats('user-1', 30);

      expect(stats.totalFeedback).toBe(0);
      expect(stats.acceptRate).toBe(0);
      expect(stats.rejectRate).toBe(0);
      expect(stats.manualRate).toBe(0);
    });
  });

  describe('shouldTriggerRetraining', () => {
    it('should trigger retraining when 100+ new samples exist', async () => {
      (prismaMock.mlModel.findFirst as jest.Mock).mockResolvedValue({
        id: 'model-1',
        userId: 'user-1',
        version: '1.0',
        algorithm: 'xgboost',
        accuracy: 0.85,
        trainingDate: new Date('2024-01-01'),
        modelPath: '/models/model1',
        createdAt: new Date(),
      });

      (prismaMock.trainingData.count as jest.Mock).mockResolvedValue(150);
      (prismaMock.trainingData.findMany as jest.Mock).mockResolvedValue([]);

      const result = await feedbackService.shouldTriggerRetraining('user-1');

      expect(result.shouldRetrain).toBe(true);
      expect(result.reason).toContain('150 new training samples');
    });

    it('should not trigger retraining when conditions not met', async () => {
      (prismaMock.mlModel.findFirst as jest.Mock).mockResolvedValue({
        id: 'model-1',
        userId: 'user-1',
        version: '1.0',
        algorithm: 'xgboost',
        accuracy: 0.85,
        trainingDate: new Date(),
        modelPath: '/models/model1',
        createdAt: new Date(),
      });

      (prismaMock.trainingData.count as jest.Mock).mockResolvedValue(10);
      (prismaMock.trainingData.findMany as jest.Mock).mockResolvedValue([]);

      const result = await feedbackService.shouldTriggerRetraining('user-1');

      expect(result.shouldRetrain).toBe(false);
      expect(result.reason).toBe('Model performance is stable');
    });
  });
});
