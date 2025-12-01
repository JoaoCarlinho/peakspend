/**
 * Integration tests for API contracts
 * Story 6-3
 *
 * These tests validate:
 * - Complete API endpoint functionality with real database
 * - Request/response schemas and contracts
 * - Database constraints and transactions
 * - Error handling across the stack
 */

import request from 'supertest';
import app from '../../src/app';
import { PrismaClient } from '../../src/generated/prisma/client';
import { signToken } from '../../src/utils/jwt.utils';

// Ensure DATABASE_URL is set for test database
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://supertutors:devpassword@localhost:5432/peakspend_test';

// Create Prisma client with DATABASE_URL from environment
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

describe('Integration Tests: API Contracts', () => {
  let testUserId: string;
  let testUserEmail: string;
  let authToken: string;
  let testCategoryId: string;
  let testExpenseId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // Create test user
    testUserEmail = `integration-test-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email: testUserEmail,
        passwordHash: 'testpassword123',
        name: 'Integration Test User',
      },
    });
    testUserId = user.id;

    // Generate JWT token for authentication
    authToken = signToken({
      userId: testUserId,
      email: testUserEmail,
    });

    // Ensure we have default categories
    const defaultCategories = await prisma.category.findMany({
      where: { isDefault: true },
    });

    if (defaultCategories.length === 0) {
      // Create some default categories for testing
      await prisma.category.createMany({
        data: [
          { name: 'Groceries', color: '#4CAF50', isDefault: true },
          { name: 'Transportation', color: '#2196F3', isDefault: true },
          { name: 'Entertainment', color: '#9C27B0', isDefault: true },
        ],
      });
    }
  });

  afterAll(async () => {
    // Cleanup test data
    if (testUserId) {
      await prisma.expense.deleteMany({ where: { userId: testUserId } });
      await prisma.category.deleteMany({ where: { userId: testUserId } });
      await prisma.trainingData.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
    }
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up expenses and categories after each test
    if (testUserId) {
      await prisma.expense.deleteMany({ where: { userId: testUserId } });
      await prisma.category.deleteMany({ where: { userId: testUserId, isDefault: false } });
      await prisma.trainingData.deleteMany({ where: { userId: testUserId } });
    }
    testCategoryId = undefined as any;
    testExpenseId = undefined as any;
  });

  describe('AC-1: Category API Integration', () => {
    it('should validate category schema on creation', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Valid Category',
          color: '#FF5733',
          userId: testUserId,
        })
        .expect(201);

      // Validate response schema
      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: 'Valid Category',
        color: '#FF5733',
        userId: testUserId,
        isDefault: false,
        createdAt: expect.any(String),
      });

      // Verify in database
      const dbCategory = await prisma.category.findUnique({
        where: { id: response.body.id },
      });
      expect(dbCategory).toBeTruthy();
      expect(dbCategory?.name).toBe('Valid Category');
    });

    it('should enforce unique category names per user', async () => {
      // Create first category
      await prisma.category.create({
        data: {
          name: 'Unique Category',
          color: '#000000',
          userId: testUserId,
          isDefault: false,
        },
      });

      // Try to create duplicate
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Unique Category',
          color: '#111111',
          userId: testUserId,
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should list categories with proper pagination', async () => {
      // Create multiple custom categories
      for (let i = 0; i < 5; i++) {
        await prisma.category.create({
          data: {
            name: `Category ${i}`,
            color: `#00000${i}`,
            userId: testUserId,
            isDefault: false,
          },
        });
      }

      const response = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 3 })
        .expect(200);

      expect(response.body).toHaveProperty('categories');
      expect(Array.isArray(response.body.categories)).toBe(true);
      expect(response.body.categories.length).toBeGreaterThan(0);
    });
  });

  describe('AC-1: Expense API Integration', () => {
    beforeEach(async () => {
      // Clean up any existing test categories first
      await prisma.category.deleteMany({
        where: { userId: testUserId, name: 'Test Category' },
      });
      
      // Create a test category
      const category = await prisma.category.create({
        data: {
          name: `Test Category ${Date.now()}`,
          color: '#123456',
          userId: testUserId,
          isDefault: false,
        },
      });
      testCategoryId = category.id;
    });

    it('should create expense with complete data validation', async () => {
      const expenseData = {
        userId: testUserId,
        amount: 123.45,
        merchant: 'Integration Test Merchant',
        categoryId: testCategoryId,
        date: new Date().toISOString(),
        notes: 'Integration test notes',
      };

      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send(expenseData)
        .expect(201);

      // Validate response schema
      expect(response.body).toMatchObject({
        id: expect.any(String),
        userId: testUserId,
        amount: 123.45,
        merchant: 'Integration Test Merchant',
        categoryId: testCategoryId,
        notes: 'Integration test notes',
        date: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      // Verify in database
      const dbExpense = await prisma.expense.findUnique({
        where: { id: response.body.id },
      });
      expect(dbExpense).toBeTruthy();
      expect(dbExpense?.amount).toBe(123.45);
    });

    it('should reject expense with invalid amount', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          amount: -100, // Invalid: negative
          merchant: 'Test',
          categoryId: testCategoryId,
          date: new Date().toISOString(),
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject expense with missing required fields', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          // Missing: amount, merchant, categoryId
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should support complex filtering with multiple parameters', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Create expenses with different attributes
      await prisma.expense.create({
        data: {
          userId: testUserId,
          amount: 50,
          merchant: 'Store A',
          categoryId: testCategoryId,
          date: yesterday,
        },
      });

      await prisma.expense.create({
        data: {
          userId: testUserId,
          amount: 100,
          merchant: 'Store B',
          categoryId: testCategoryId,
          date: today,
        },
      });

      // Filter by date range
      const response = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          userId: testUserId,
          startDate: today.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        })
        .expect(200);

      expect(response.body.expenses.length).toBe(1);
      expect(response.body.expenses[0].merchant).toBe('Store B');
    });

    it('should handle concurrent updates correctly', async () => {
      // Create an expense
      const expense = await prisma.expense.create({
        data: {
          userId: testUserId,
          amount: 100,
          merchant: 'Concurrent Test',
          categoryId: testCategoryId,
          date: new Date(),
        },
      });

      // Attempt concurrent updates
      const update1Promise = request(app)
        .put(`/api/expenses/${expense.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 150 });

      const update2Promise = request(app)
        .put(`/api/expenses/${expense.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 200 });

      await Promise.all([update1Promise, update2Promise]);

      // Verify final state
      const finalExpense = await prisma.expense.findUnique({
        where: { id: expense.id },
      });

      // One of the updates should have succeeded
      expect([150, 200]).toContain(finalExpense?.amount);
    });
  });

  describe('AC-2: Database Constraints and Transactions', () => {
    beforeEach(async () => {
      // Clean up any existing test categories first
      await prisma.category.deleteMany({
        where: { userId: testUserId, name: { startsWith: 'Transaction Test Category' } },
      });
      
      const category = await prisma.category.create({
        data: {
          name: `Transaction Test Category ${Date.now()}`,
          color: '#ABCDEF',
          userId: testUserId,
          isDefault: false,
        },
      });
      testCategoryId = category.id;
    });

    it('should enforce foreign key constraints', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          amount: 50,
          merchant: 'FK Test',
          categoryId: '00000000-0000-0000-0000-000000000000', // Non-existent category
          date: new Date().toISOString(),
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle cascade delete correctly', async () => {
      // Create expense
      const expense = await prisma.expense.create({
        data: {
          userId: testUserId,
          amount: 75,
          merchant: 'Cascade Test',
          categoryId: testCategoryId,
          date: new Date(),
        },
      });

      // Create related training data
      await prisma.trainingData.create({
        data: {
          userId: testUserId,
          expenseId: expense.id,
          predictedCategory: testCategoryId,
          actualCategory: testCategoryId,
          feedbackType: 'ACCEPT',
        },
      });

      // Delete expense
      await request(app)
        .delete(`/api/expenses/${expense.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify expense is deleted
      const deletedExpense = await prisma.expense.findUnique({
        where: { id: expense.id },
      });
      expect(deletedExpense).toBeNull();

      // Verify training data still exists (no cascade)
      const trainingData = await prisma.trainingData.findFirst({
        where: { expenseId: expense.id },
      });
      // Training data should remain for ML model training
      expect(trainingData).toBeTruthy();
    });

    it('should maintain data integrity with SetNull on category deletion', async () => {
      // Create expense with category
      const expense = await prisma.expense.create({
        data: {
          userId: testUserId,
          amount: 100,
          merchant: 'SetNull Test',
          categoryId: testCategoryId,
          date: new Date(),
        },
      });

      // Delete the category
      await request(app)
        .delete(`/api/categories/${testCategoryId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Check expense - categoryId should be null
      const updatedExpense = await prisma.expense.findUnique({
        where: { id: expense.id },
      });
      expect(updatedExpense).toBeTruthy();
      expect(updatedExpense?.categoryId).toBeNull();
    });
  });

  describe('AC-3: ML Service Integration', () => {
    beforeEach(async () => {
      // Clean up any existing test categories first
      await prisma.category.deleteMany({
        where: { userId: testUserId, name: { startsWith: 'ML Test Category' } },
      });
      
      const category = await prisma.category.create({
        data: {
          name: `ML Test Category ${Date.now()}`,
          color: '#FEDCBA',
          userId: testUserId,
          isDefault: false,
        },
      });
      testCategoryId = category.id;
    });

    it('should handle ML service category suggestions', async () => {
      const response = await request(app)
        .post('/api/ml-inference/suggest-category')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          merchant: 'Coffee Shop',
          amount: 5.50,
          date: new Date().toISOString(),
        })
        .expect(200);

      // Validate response structure
      expect(response.body).toHaveProperty('predictions');
      expect(Array.isArray(response.body.predictions)).toBe(true);
      expect(response.body).toHaveProperty('topPrediction');

      if (response.body.predictions.length > 0) {
        expect(response.body.predictions[0]).toMatchObject({
          categoryId: expect.any(String),
          categoryName: expect.any(String),
          confidence: expect.any(Number),
        });
      }
    });

    it('should handle ML error detection gracefully', async () => {
      const response = await request(app)
        .post('/api/ml-inference/detect-errors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          merchant: 'Test Merchant',
          amount: 1000,
          date: new Date().toISOString(),
        })
        .expect(200);

      // Validate response structure
      expect(response.body).toHaveProperty('hasError');
      expect(response.body).toHaveProperty('errorType');
      expect(typeof response.body.hasError).toBe('boolean');

      if (response.body.hasError) {
        expect(response.body.errorType).toBeTruthy();
      }
    });
  });

  describe('AC-6: Feedback and Training Data Integration', () => {
    beforeEach(async () => {
      // Clean up any existing test categories first
      await prisma.category.deleteMany({
        where: { userId: testUserId, name: { startsWith: 'Feedback Test Category' } },
      });
      
      const category = await prisma.category.create({
        data: {
          name: `Feedback Test Category ${Date.now()}`,
          color: '#112233',
          userId: testUserId,
          isDefault: false,
        },
      });
      testCategoryId = category.id;

      // Create test expense
      const expense = await prisma.expense.create({
        data: {
          userId: testUserId,
          amount: 50,
          merchant: 'Feedback Test Merchant',
          categoryId: testCategoryId,
          date: new Date(),
        },
      });
      testExpenseId = expense.id;
    });

    it('should record feedback and create training data', async () => {
      const response = await request(app)
        .post('/api/feedback/record')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          expenseId: testExpenseId,
          predictedCategory: testCategoryId,
          actualCategory: testCategoryId,
          feedbackType: 'ACCEPT',
        })
        .expect(201);

      // Validate response
      expect(response.body).toMatchObject({
        id: expect.any(String),
        userId: testUserId,
        expenseId: testExpenseId,
        feedbackType: 'ACCEPT',
      });

      // Verify in database
      const trainingData = await prisma.trainingData.findUnique({
        where: { id: response.body.id },
      });
      expect(trainingData).toBeTruthy();
      expect(trainingData?.feedbackType).toBe('ACCEPT');
    });

    it('should calculate feedback statistics correctly', async () => {
      // Create multiple feedback entries
      for (let i = 0; i < 5; i++) {
        await prisma.trainingData.create({
          data: {
            userId: testUserId,
            expenseId: testExpenseId,
            predictedCategory: testCategoryId,
            actualCategory: testCategoryId,
            feedbackType: i < 3 ? 'ACCEPT' : 'REJECT',
          },
        });
      }

      const response = await request(app)
        .get('/api/feedback/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ userId: testUserId, days: 30 })
        .expect(200);

      expect(response.body).toMatchObject({
        totalFeedback: expect.any(Number),
        acceptCount: expect.any(Number),
        rejectCount: expect.any(Number),
        accuracy: expect.any(Number),
      });

      expect(response.body.totalFeedback).toBeGreaterThanOrEqual(5);
      expect(response.body.acceptCount).toBeGreaterThanOrEqual(3);
      expect(response.body.rejectCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('AC-6: ML Metrics Integration', () => {
    it('should retrieve ML accuracy metrics', async () => {
      const response = await request(app)
        .get('/api/ml-metrics/accuracy')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ userId: testUserId, days: 30 })
        .expect(200);

      expect(response.body).toMatchObject({
        accuracy: expect.any(Number),
        totalPredictions: expect.any(Number),
        correctPredictions: expect.any(Number),
      });

      expect(response.body.accuracy).toBeGreaterThanOrEqual(0);
      expect(response.body.accuracy).toBeLessThanOrEqual(1);
    });

    it('should retrieve dashboard data', async () => {
      const response = await request(app)
        .get('/api/ml-metrics/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ userId: testUserId })
        .expect(200);

      expect(response.body).toHaveProperty('overallAccuracy');
      expect(response.body).toHaveProperty('totalPredictions');
      expect(response.body).toHaveProperty('recentActivity');
    });
  });

  describe('AC-7: Error Handling and Edge Cases', () => {
    it('should return 404 for non-existent resources', async () => {
      await request(app)
        .get('/api/expenses/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      await request(app)
        .get('/api/categories/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should validate UUID format in route parameters', async () => {
      await request(app)
        .get('/api/expenses/invalid-uuid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should enforce request size limits', async () => {
      const largePayload = {
        userId: testUserId,
        amount: 100,
        merchant: 'X'.repeat(10000), // Very long merchant name
        categoryId: testCategoryId,
        date: new Date().toISOString(),
        notes: 'Y'.repeat(10000), // Very long notes
      };

      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send(largePayload)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Health and Status Endpoints', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
      });
    });

    it('should handle 404 for unknown routes', async () => {
      await request(app)
        .get('/api/unknown-endpoint')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});
