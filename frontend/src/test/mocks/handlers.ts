import { http, HttpResponse } from 'msw';
import type { Expense } from '../../types/expense';
import type { Category } from '../../types/category';

const API_BASE_URL = 'http://localhost:3000';
const ML_API_BASE_URL = 'http://localhost:8000';

// Mock data
const mockCategories: Category[] = [
  { id: '1', name: 'Groceries', color: '#4CAF50', icon: 'shopping_cart', isDefault: true, _count: { expenses: 15 } },
  { id: '2', name: 'Dining', color: '#FF9800', icon: 'restaurant', isDefault: true, _count: { expenses: 10 } },
  { id: '3', name: 'Transportation', color: '#2196F3', icon: 'directions_car', isDefault: true, _count: { expenses: 8 } },
  { id: '4', name: 'Entertainment', color: '#9C27B0', icon: 'movie', isDefault: true, _count: { expenses: 5 } },
];

const mockExpenses: Expense[] = [
  {
    id: '1',
    userId: 'user1',
    date: '2025-11-01',
    amount: 45.5,
    merchant: 'Whole Foods',
    category: mockCategories[0],
    categoryId: '1',
    notes: 'Weekly groceries',
    receiptUrl: null,
    createdAt: '2025-11-01T10:00:00Z',
    updatedAt: '2025-11-01T10:00:00Z',
  },
  {
    id: '2',
    userId: 'user1',
    date: '2025-11-02',
    amount: 25.0,
    merchant: 'Starbucks',
    category: mockCategories[1],
    categoryId: '2',
    notes: 'Coffee meeting',
    receiptUrl: null,
    createdAt: '2025-11-02T14:00:00Z',
    updatedAt: '2025-11-02T14:00:00Z',
  },
];

export const handlers = [
  // GET /api/expenses
  http.get(`${API_BASE_URL}/api/expenses`, () => {
    return HttpResponse.json({
      data: mockExpenses,
      pagination: {
        page: 1,
        limit: 50,
        total: mockExpenses.length,
        totalPages: 1,
      },
    });
  }),

  // GET /api/expenses/:id
  http.get(`${API_BASE_URL}/api/expenses/:id`, ({ params }) => {
    const { id } = params;
    const expense = mockExpenses.find((e) => e.id === id);
    if (!expense) {
      return HttpResponse.json({ message: 'Expense not found' }, { status: 404 });
    }
    return HttpResponse.json(expense);
  }),

  // POST /api/expenses
  http.post(`${API_BASE_URL}/api/expenses`, async ({ request }) => {
    const body = (await request.json()) as Partial<Expense>;
    const newExpense: Expense = {
      id: String(mockExpenses.length + 1),
      userId: 'user1',
      date: body.date || new Date().toISOString(),
      amount: body.amount || 0,
      merchant: body.merchant || '',
      category: body.categoryId
        ? mockCategories.find((c) => c.id === body.categoryId) || null
        : null,
      categoryId: body.categoryId || null,
      notes: body.notes || null,
      receiptUrl: body.receiptUrl || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return HttpResponse.json(newExpense, { status: 201 });
  }),

  // PUT /api/expenses/:id
  http.put(`${API_BASE_URL}/api/expenses/:id`, async ({ params, request }) => {
    const { id } = params;
    const body = (await request.json()) as Partial<Expense>;
    const expense = mockExpenses.find((e) => e.id === id);
    if (!expense) {
      return HttpResponse.json({ message: 'Expense not found' }, { status: 404 });
    }
    const updated = { ...expense, ...body, updatedAt: new Date().toISOString() };
    return HttpResponse.json(updated);
  }),

  // PATCH /api/expenses/:id (alternative update method)
  http.patch(`${API_BASE_URL}/api/expenses/:id`, async ({ params, request }) => {
    const { id } = params;
    const body = (await request.json()) as Partial<Expense>;
    const expense = mockExpenses.find((e) => e.id === id);
    if (!expense) {
      return HttpResponse.json({ message: 'Expense not found' }, { status: 404 });
    }
    const updated = { ...expense, ...body, updatedAt: new Date().toISOString() };
    return HttpResponse.json(updated);
  }),

  // DELETE /api/expenses/:id
  http.delete(`${API_BASE_URL}/api/expenses/:id`, ({ params }) => {
    const { id } = params;
    const expense = mockExpenses.find((e) => e.id === id);
    if (!expense) {
      return HttpResponse.json({ message: 'Expense not found' }, { status: 404 });
    }
    return HttpResponse.json(null, { status: 204 });
  }),

  // GET /api/categories
  http.get(`${API_BASE_URL}/api/categories`, () => {
    return HttpResponse.json(mockCategories);
  }),

  // POST /api/categories
  http.post(`${API_BASE_URL}/api/categories`, async ({ request }) => {
    const body = (await request.json()) as Partial<Category>;
    const newCategory: Category = {
      id: String(mockCategories.length + 1),
      name: body.name || '',
      color: body.color || '#000000',
      icon: body.icon || 'category',
      isDefault: false,
      _count: { expenses: 0 },
    };
    return HttpResponse.json(newCategory, { status: 201 });
  }),

  // PUT /api/categories/:id
  http.put(`${API_BASE_URL}/api/categories/:id`, async ({ params, request }) => {
    const { id } = params;
    const body = (await request.json()) as Partial<Category>;
    const category = mockCategories.find((c) => c.id === id);
    if (!category) {
      return HttpResponse.json({ message: 'Category not found' }, { status: 404 });
    }
    if (category.isDefault) {
      return HttpResponse.json({ message: 'Cannot edit default category' }, { status: 403 });
    }
    const updatedCategory: Category = {
      ...category,
      ...body,
    };
    return HttpResponse.json(updatedCategory);
  }),

  // DELETE /api/categories/:id
  http.delete(`${API_BASE_URL}/api/categories/:id`, ({ params }) => {
    const { id } = params;
    const category = mockCategories.find((c) => c.id === id);
    if (!category) {
      return HttpResponse.json({ message: 'Category not found' }, { status: 404 });
    }
    if (category.isDefault) {
      return HttpResponse.json({ message: 'Cannot delete default category' }, { status: 403 });
    }
    return HttpResponse.json(null, { status: 204 });
  }),

  // GET /api/expenses/export
  http.get(`${API_BASE_URL}/api/expenses/export`, () => {
    const csv = [
      'Date,Merchant,Amount,Category,Notes',
      '2025-11-01,Whole Foods,45.50,Groceries,Weekly groceries',
      '2025-11-02,Starbucks,25.00,Dining,Coffee meeting',
    ].join('\n');
    return HttpResponse.text(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="expenses_2025-11-08.csv"',
      },
    });
  }),

  // GET /api/ml-metrics/dashboard
  http.get(`${API_BASE_URL}/api/ml-metrics/dashboard`, () => {
    return HttpResponse.json({
      currentAccuracy: 0.87,
      accuracyTrend: [
        { date: '2025-10-09', accuracy: 0.75 },
        { date: '2025-10-16', accuracy: 0.78 },
        { date: '2025-10-23', accuracy: 0.82 },
        { date: '2025-10-30', accuracy: 0.85 },
        { date: '2025-11-06', accuracy: 0.87 },
      ],
      categoryBreakdown: [
        { category: 'Groceries', accuracy: 0.92, predictions: 45 },
        { category: 'Dining', accuracy: 0.88, predictions: 32 },
        { category: 'Transportation', accuracy: 0.85, predictions: 28 },
        { category: 'Entertainment', accuracy: 0.68, predictions: 15 },
      ],
      improvementMetrics: {
        accuracyChange30Days: 0.12,
        accuracyChange7Days: 0.02,
        totalFeedbackCount: 120,
      },
      recentErrors: [
        {
          merchant: 'Uber',
          predicted: 'Entertainment',
          actual: 'Transportation',
          date: '2025-11-07',
        },
        {
          merchant: 'Netflix',
          predicted: 'Groceries',
          actual: 'Entertainment',
          date: '2025-11-06',
        },
      ],
    });
  }),

  // GET /api/ml-metrics/improvement
  http.get(`${API_BASE_URL}/api/ml-metrics/improvement`, () => {
    return HttpResponse.json({
      accuracyImprovement: 0.15,
      learningRate: 0.75,
      userEngagement: 0.82,
      timeSavings: {
        manualCategorizationsBefore: 100,
        autoCategorizationsNow: 87,
        percentageReduction: 87,
      },
    });
  }),

  // GET /api/ml-metrics/accuracy
  http.get(`${API_BASE_URL}/api/ml-metrics/accuracy`, () => {
    return HttpResponse.json({
      overallAccuracy: 0.87,
      categoryAccuracy: {
        Groceries: 0.92,
        Dining: 0.88,
        Transportation: 0.85,
        Entertainment: 0.68,
      },
      predictionConfidenceAvg: 0.83,
      totalPredictions: 120,
      correctPredictions: 104,
    });
  }),

  // POST /api/ml-inference/suggest-category
  http.post(`${API_BASE_URL}/api/ml-inference/suggest-category`, async ({ request }) => {
    const body = (await request.json()) as { merchant: string; amount: number };
    const merchant = body.merchant.toLowerCase();

    let suggestions = [];

    // Simple rule-based suggestions based on merchant name
    if (merchant.includes('market') || merchant.includes('grocery') || merchant.includes('foods')) {
      suggestions = [
        {
          categoryId: '1',
          categoryName: 'Groceries',
          confidence: 0.92,
          reasoning: 'Merchant name suggests grocery shopping',
          source: 'ml',
        },
        {
          categoryId: '2',
          categoryName: 'Dining',
          confidence: 0.15,
          reasoning: 'Some markets have prepared food sections',
          source: 'pattern',
        },
      ];
    } else if (merchant.includes('restaurant') || merchant.includes('cafe') || merchant.includes('coffee')) {
      suggestions = [
        {
          categoryId: '2',
          categoryName: 'Dining',
          confidence: 0.95,
          reasoning: 'Merchant is a restaurant or café',
          source: 'ml',
        },
        {
          categoryId: '4',
          categoryName: 'Entertainment',
          confidence: 0.12,
          reasoning: 'Dining can be entertainment',
          source: 'pattern',
        },
      ];
    } else if (merchant.includes('uber') || merchant.includes('lyft') || merchant.includes('taxi')) {
      suggestions = [
        {
          categoryId: '3',
          categoryName: 'Transportation',
          confidence: 0.98,
          reasoning: 'Ride-sharing or taxi service',
          source: 'ml',
        },
      ];
    } else if (merchant.includes('movie') || merchant.includes('theater') || merchant.includes('cinema')) {
      suggestions = [
        {
          categoryId: '4',
          categoryName: 'Entertainment',
          confidence: 0.94,
          reasoning: 'Entertainment venue',
          source: 'ml',
        },
      ];
    } else {
      // Default suggestion based on amount
      if (body.amount > 100) {
        suggestions = [
          {
            categoryId: '1',
            categoryName: 'Groceries',
            confidence: 0.45,
            reasoning: 'Large purchase, possibly groceries',
            source: 'pattern',
          },
        ];
      } else {
        suggestions = [
          {
            categoryId: '2',
            categoryName: 'Dining',
            confidence: 0.40,
            reasoning: 'Common expense category',
            source: 'pattern',
          },
        ];
      }
    }

    return HttpResponse.json({
      suggestions,
      topSuggestion: suggestions.length > 0 ? suggestions[0] : null,
    });
  }),

  // POST /api/ml-inference/detect-errors
  http.post(`${API_BASE_URL}/api/ml-inference/detect-errors`, async ({ request }) => {
    const body = (await request.json()) as { merchant: string; amount: number; date: string };
    const errors = [];

    // Check for unusually high amount
    if (body.amount > 1000) {
      errors.push({
        field: 'Amount',
        severity: 'medium',
        message: 'This amount is unusually high for this type of expense',
        suggestion: 'Please verify the amount is correct',
      });
    }

    // Check for weekend date + large amount
    const date = new Date(body.date);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    if (isWeekend && body.amount > 500) {
      errors.push({
        field: 'Date',
        severity: 'low',
        message: 'Large expense on a weekend',
        suggestion: 'Ensure this is a business expense if claiming for reimbursement',
      });
    }

    return HttpResponse.json({
      errors,
      hasErrors: errors.length > 0,
    });
  }),

  // POST /api/ml/recommend (ML service)
  http.post(`${ML_API_BASE_URL}/api/ml/recommend`, async ({ request }) => {
    const body = (await request.json()) as {
      user_id: string;
      merchant: string;
      amount: number;
      date?: string;
      notes?: string;
      category?: string;
      receipt_attached?: boolean;
      top_k?: number;
    };

    const merchant = body.merchant.toLowerCase();
    let predictions = [];

    // Simple rule-based predictions
    if (merchant.includes('market') || merchant.includes('grocery') || merchant.includes('foods')) {
      predictions = [
        {
          category: 'Groceries',
          confidence: 0.92,
          confidence_pct: 92,
          confidence_level: 'high',
          explanation: 'Merchant name suggests grocery shopping',
          detailed_explanation: 'Based on merchant name patterns',
          contributing_factors: [
            { factor: 'merchant_name', description: 'Grocery-related keywords', importance: 0.8 },
          ],
        },
      ];
    } else if (merchant.includes('restaurant') || merchant.includes('cafe') || merchant.includes('starbucks')) {
      predictions = [
        {
          category: 'Dining',
          confidence: 0.95,
          confidence_pct: 95,
          confidence_level: 'high',
          explanation: 'Merchant is a restaurant or café',
          detailed_explanation: 'Based on merchant name patterns',
          contributing_factors: [
            { factor: 'merchant_name', description: 'Dining-related keywords', importance: 0.9 },
          ],
        },
      ];
    } else {
      predictions = [
        {
          category: 'Other',
          confidence: 0.5,
          confidence_pct: 50,
          confidence_level: 'medium',
          explanation: 'Unable to determine category with high confidence',
          detailed_explanation: 'Merchant not in known patterns',
          contributing_factors: [],
        },
      ];
    }

    return HttpResponse.json({
      user_id: body.user_id,
      predictions,
      errors: [],
      cold_start: false,
      inference_time_ms: 15,
      feature_quality: 0.85,
    });
  }),
];
