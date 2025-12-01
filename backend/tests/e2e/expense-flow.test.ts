/**
 * E2E tests for complete expense workflow
 * Story 6-4
 *
 * These tests validate the complete expense management workflow including:
 * - Category management
 * - Expense creation, listing, updating, deletion
 * - ML inference integration
 * - Feedback collection
 * - ML metrics tracking
 */

import request from 'supertest';
import app from '../../src/app';
import { PrismaClient } from '../../src/generated/prisma/client';
import { signToken } from '../../src/utils/jwt.utils';

// Ensure DATABASE_URL is set for test database
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://supertutors:devpassword@localhost:5432/peakspend_test';

// Use test database URL - set explicitly
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

describe('E2E: Complete Expense Workflow', () => {
  let testUserId: string;
  let testUserEmail: string;
  let authToken: string;
  let testCategoryId: string;
  let testExpenseId: string;

  beforeAll(async () => {
    // Connect to test database
    await prisma.$connect();

    // Create test user
    testUserEmail = `test-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email: testUserEmail,
        passwordHash: 'hashedpassword123', // In reality, this would be properly hashed
        name: 'Test User',
      },
    });
    testUserId = user.id;

    // Generate JWT token for authentication
    authToken = signToken({
      userId: testUserId,
      email: testUserEmail,
    });
  });

  afterAll(async () => {
    // Cleanup: Delete test data
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

  describe('AC-4: Category Management Flow', () => {
    it('should list default categories', async () => {
      const response = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('categories');
      expect(Array.isArray(response.body.categories)).toBe(true);
      expect(response.body.categories.length).toBeGreaterThan(0);

      // Check for some default categories
      const categoryNames = response.body.categories.map((c: any) => c.name);
      expect(categoryNames).toContain('Groceries');
    });

    it('should create a custom category', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Category',
          color: '#FF5733',
          userId: testUserId,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Test Category');
      expect(response.body.color).toBe('#FF5733');
      expect(response.body.userId).toBe(testUserId);

      testCategoryId = response.body.id;
    });

    it('should include created category in list', async () => {
      // First create a category
      const createResponse = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Fetch Test Category',
          color: '#00FF00',
          userId: testUserId,
        })
        .expect(201);

      const categoryId = createResponse.body.id;

      // Then verify it appears in the list
      const response = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const createdCategory = response.body.categories.find((c: any) => c.id === categoryId);
      expect(createdCategory).toBeTruthy();
      expect(createdCategory.name).toBe('Fetch Test Category');
    });

    it('should update a custom category', async () => {
      // Create category first
      const createResponse = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Original Name',
          color: '#000000',
          userId: testUserId,
        })
        .expect(201);

      const categoryId = createResponse.body.id;

      // Update it
      const response = await request(app)
        .put(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Name',
          color: '#FFFFFF',
        })
        .expect(200);

      expect(response.body.name).toBe('Updated Name');
      expect(response.body.color).toBe('#FFFFFF');
    });

    it('should delete a custom category', async () => {
      // Create category first
      const createResponse = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'To Be Deleted',
          color: '#FF0000',
          userId: testUserId,
        })
        .expect(201);

      const categoryId = createResponse.body.id;

      // Delete it
      await request(app)
        .delete(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify it's gone
      await request(app)
        .get(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('AC-2: Expense Creation and Management Flow', () => {
    beforeEach(async () => {
      // Clean up any existing test categories first
      await prisma.category.deleteMany({
        where: { userId: testUserId, name: { startsWith: 'Test Expense Category' } },
      });
      
      // Create a test category for expenses
      const category = await prisma.category.create({
        data: {
          name: `Test Expense Category ${Date.now()}`,
          color: '#123456',
          userId: testUserId,
          isDefault: false,
        },
      });
      testCategoryId = category.id;
    });

    it('should create an expense', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          amount: 42.50,
          merchant: 'Test Merchant',
          categoryId: testCategoryId,
          date: new Date().toISOString(),
          notes: 'Test expense note',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(parseFloat(response.body.amount)).toBe(42.50);
      expect(response.body.merchant).toBe('Test Merchant');
      expect(response.body.categoryId).toBe(testCategoryId);
      expect(response.body.userId).toBe(testUserId);

      testExpenseId = response.body.id;
    });

    it('should list expenses with pagination', async () => {
      // Create multiple expenses
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/expenses')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: testUserId,
            amount: 10 + i,
            merchant: `Merchant ${i}`,
            categoryId: testCategoryId,
            date: new Date().toISOString(),
          })
          .expect(201);
      }

      const response = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ userId: testUserId, page: 1, limit: 3 })
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('page');
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.data.length).toBeLessThanOrEqual(3);
      expect(response.body.pagination.total).toBe(5);
    });

    it('should filter expenses by category', async () => {
      // Clean up any existing test categories first
      await prisma.category.deleteMany({
        where: { userId: testUserId, name: { startsWith: 'Filter Test Category' } },
      });
      
      // Create another category
      const category2 = await prisma.category.create({
        data: {
          name: `Filter Test Category ${Date.now()}`,
          color: '#654321',
          userId: testUserId,
          isDefault: false,
        },
      });

      // Create expenses in different categories
      await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          amount: 100,
          merchant: 'Category 1 Merchant',
          categoryId: testCategoryId,
          date: new Date().toISOString(),
        })
        .expect(201);

      await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          amount: 200,
          merchant: 'Category 2 Merchant',
          categoryId: category2.id,
          date: new Date().toISOString(),
        })
        .expect(201);

      // Filter by first category
      const response = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ userId: testUserId, categoryId: testCategoryId })
        .expect(200);

      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].categoryId).toBe(testCategoryId);
    });

    it('should filter expenses by date range', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Create expense with yesterday's date
      await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          amount: 50,
          merchant: 'Yesterday Merchant',
          categoryId: testCategoryId,
          date: yesterday.toISOString(),
        })
        .expect(201);

      // Create expense with today's date
      await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          amount: 75,
          merchant: 'Today Merchant',
          categoryId: testCategoryId,
          date: today.toISOString(),
        })
        .expect(201);

      // Filter for today only
      const response = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          userId: testUserId,
          dateFrom: today.toISOString().split('T')[0],
          dateTo: tomorrow.toISOString().split('T')[0],
        })
        .expect(200);

      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].merchant).toBe('Today Merchant');
    });

    it('should search expenses by merchant name', async () => {
      await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          amount: 30,
          merchant: 'Starbucks Coffee',
          categoryId: testCategoryId,
          date: new Date().toISOString(),
        })
        .expect(201);

      await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          amount: 40,
          merchant: 'Whole Foods Market',
          categoryId: testCategoryId,
          date: new Date().toISOString(),
        })
        .expect(201);

      const response = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ userId: testUserId, search: 'starbucks' })
        .expect(200);

      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].merchant).toContain('Starbucks');
    });

    it('should get expense by ID', async () => {
      const createResponse = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          amount: 99.99,
          merchant: 'Fetch Test',
          categoryId: testCategoryId,
          date: new Date().toISOString(),
        })
        .expect(201);

      const expenseId = createResponse.body.id;

      const response = await request(app)
        .get(`/api/expenses/${expenseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(expenseId);
      expect(parseFloat(response.body.amount)).toBe(99.99);
    });

    it('should update an expense', async () => {
      const createResponse = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          amount: 50,
          merchant: 'Original Merchant',
          categoryId: testCategoryId,
          date: new Date().toISOString(),
        })
        .expect(201);

      const expenseId = createResponse.body.id;

      const response = await request(app)
        .patch(`/api/expenses/${expenseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 75,
          merchant: 'Updated Merchant',
          notes: 'Updated notes',
        })
        .expect(200);

      expect(parseFloat(response.body.amount)).toBe(75);
      expect(response.body.merchant).toBe('Updated Merchant');
      expect(response.body.notes).toBe('Updated notes');
    });

    it('should delete an expense', async () => {
      const createResponse = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          amount: 25,
          merchant: 'To Delete',
          categoryId: testCategoryId,
          date: new Date().toISOString(),
        })
        .expect(201);

      const expenseId = createResponse.body.id;

      await request(app)
        .delete(`/api/expenses/${expenseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      await request(app)
        .get(`/api/expenses/${expenseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('AC-3: ML Inference Integration Flow', () => {
    beforeEach(async () => {
      // Clean up any existing test categories first
      await prisma.category.deleteMany({
        where: { userId: testUserId, name: { startsWith: 'ML Test Category' } },
      });
      
      // Create a test category
      const category = await prisma.category.create({
        data: {
          name: `ML Test Category ${Date.now()}`,
          color: '#ABCDEF',
          userId: testUserId,
          isDefault: false,
        },
      });
      testCategoryId = category.id;
    });

    it('should get ML category suggestions for expense data', async () => {
      const response = await request(app)
        .post('/api/ml-inference/suggest-category')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          merchant: 'Starbucks',
          amount: 5.50,
          date: new Date().toISOString(),
        })
        .expect(200);

      expect(response.body).toHaveProperty('predictions');
      expect(Array.isArray(response.body.predictions)).toBe(true);
      expect(response.body).toHaveProperty('topPrediction');
    });

    it('should detect potential errors in expense data', async () => {
      const response = await request(app)
        .post('/api/ml-inference/detect-errors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          merchant: 'Test Merchant',
          amount: 5.00,
          date: new Date().toISOString(),
        })
        .expect(200);

      expect(response.body).toHaveProperty('hasError');
      expect(response.body).toHaveProperty('confidence');
      expect(typeof response.body.hasError).toBe('boolean');
    });
  });

  describe('AC-3: ML Feedback Collection Flow', () => {
    beforeEach(async () => {
      // Create expense for feedback
      if (!testExpenseId) {
        const expense = await prisma.expense.create({
          data: {
            userId: testUserId,
            amount: 100,
            merchant: 'Feedback Test Merchant',
            categoryId: testCategoryId,
            date: new Date(),
          },
        });
        testExpenseId = expense.id;
      }
    });

    it('should record ACCEPT feedback', async () => {
      const response = await request(app)
        .post('/api/feedback/record')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          expenseId: testExpenseId,
          predictedCategory: testCategoryId,
          actualCategory: testCategoryId,
          feedbackType: 'ACCEPT',
          confidence: 0.95,
        })
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Feedback recorded successfully');
    });

    it('should record REJECT feedback with correction', async () => {
      // Clean up any existing test categories first
      await prisma.category.deleteMany({
        where: { userId: testUserId, name: { startsWith: 'Correction Category' } },
      });

      // Create another category for correction
      const correctionCategory = await prisma.category.create({
        data: {
          name: `Correction Category ${Date.now()}`,
          color: '#999999',
          userId: testUserId,
          isDefault: false,
        },
      });

      const response = await request(app)
        .post('/api/feedback/record')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          expenseId: testExpenseId,
          predictedCategory: testCategoryId,
          actualCategory: correctionCategory.id,
          feedbackType: 'REJECT',
          confidence: 0.75,
        })
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Feedback recorded successfully');
    });

    it('should get feedback statistics', async () => {
      const response = await request(app)
        .get('/api/feedback/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ userId: testUserId, days: 30 })
        .expect(200);

      expect(response.body).toHaveProperty('totalFeedback');
      expect(response.body).toHaveProperty('acceptRate');
      expect(response.body).toHaveProperty('rejectRate');
      expect(response.body).toHaveProperty('recentAccuracy');
    });

    it('should check if model retraining is needed', async () => {
      const response = await request(app)
        .get('/api/feedback/retraining-check')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ userId: testUserId })
        .expect(200);

      expect(response.body).toHaveProperty('shouldRetrain');
      expect(response.body).toHaveProperty('reason');
      expect(typeof response.body.shouldRetrain).toBe('boolean');
    });
  });

  describe('AC-6: ML Performance Metrics Flow', () => {
    it('should get ML accuracy metrics', async () => {
      const response = await request(app)
        .get('/api/ml-metrics/accuracy')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ userId: testUserId, days: 30 })
        .expect(200);

      expect(response.body).toHaveProperty('overallAccuracy');
      expect(response.body).toHaveProperty('totalPredictions');
      expect(response.body).toHaveProperty('correctPredictions');
    });

    it('should get ML performance dashboard data', async () => {
      const response = await request(app)
        .get('/api/ml-metrics/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ userId: testUserId })
        .expect(200);

      expect(response.body).toHaveProperty('currentAccuracy');
      expect(response.body).toHaveProperty('improvementMetrics');
      expect(response.body).toHaveProperty('accuracyTrend');
    });

    it('should get improvement metrics over time', async () => {
      const response = await request(app)
        .get('/api/ml-metrics/improvement')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ userId: testUserId })
        .expect(200);

      expect(response.body).toHaveProperty('accuracyImprovement');
      expect(response.body).toHaveProperty('learningRate');
    });
  });

  describe('AC-7: Error Handling', () => {
    it('should return 404 for non-existent expense', async () => {
      await request(app)
        .get('/api/expenses/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 404 for non-existent category', async () => {
      await request(app)
        .get('/api/categories/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should validate required fields when creating expense', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          // Missing required fields: amount, merchant, categoryId
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('errors');
    });

    it('should validate required fields when creating category', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields: name, color, userId
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('errors');
    });

    it('should handle invalid expense amount', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId,
          amount: -50, // Invalid: negative amount
          merchant: 'Test',
          categoryId: testCategoryId,
          date: new Date().toISOString(),
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('errors');
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
