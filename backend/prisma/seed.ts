import { PrismaClient } from '../src/generated/prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SALT_ROUNDS = 12;

// Test users
const USERS = [
  {
    email: 'demo@peakspend.com',
    password: 'demo1234',
    name: 'Demo User',
  },
  {
    email: 'test@peakspend.com',
    password: 'test1234',
    name: 'Test User',
  },
  {
    email: 'user@peakspend.com',
    password: 'user1234',
    name: 'Sample User',
  },
];

// System default categories
const DEFAULT_CATEGORIES = [
  { name: 'Food & Dining', color: '#FF6B6B' },
  { name: 'Transportation', color: '#4ECDC4' },
  { name: 'Entertainment', color: '#FFE66D' },
  { name: 'Shopping', color: '#95E1D3' },
  { name: 'Healthcare', color: '#F38181' },
  { name: 'Utilities', color: '#AA96DA' },
  { name: 'Rent/Mortgage', color: '#FCBAD3' },
  { name: 'Groceries', color: '#A8E6CF' },
  { name: 'Travel', color: '#FFD3B6' },
  { name: 'Other', color: '#D5AAFF' },
];

// Realistic merchant data with category associations
const MERCHANTS = [
  // Food & Dining
  { name: 'Starbucks', category: 'Food & Dining', avgAmount: 6.5, variance: 2 },
  { name: 'Chipotle', category: 'Food & Dining', avgAmount: 12, variance: 3 },
  { name: 'Subway', category: 'Food & Dining', avgAmount: 9, variance: 2 },
  { name: 'McDonald\'s', category: 'Food & Dining', avgAmount: 8, variance: 2 },
  { name: 'Pizza Hut', category: 'Food & Dining', avgAmount: 25, variance: 5 },
  { name: 'Domino\'s Pizza', category: 'Food & Dining', avgAmount: 22, variance: 4 },

  // Transportation
  { name: 'Uber', category: 'Transportation', avgAmount: 15, variance: 8 },
  { name: 'Lyft', category: 'Transportation', avgAmount: 14, variance: 7 },
  { name: 'Shell Gas Station', category: 'Transportation', avgAmount: 45, variance: 10 },
  { name: 'Chevron', category: 'Transportation', avgAmount: 48, variance: 12 },
  { name: 'BART', category: 'Transportation', avgAmount: 5.5, variance: 1 },

  // Entertainment
  { name: 'Netflix', category: 'Entertainment', avgAmount: 15.99, variance: 0 },
  { name: 'Spotify', category: 'Entertainment', avgAmount: 9.99, variance: 0 },
  { name: 'AMC Theatres', category: 'Entertainment', avgAmount: 16, variance: 3 },
  { name: 'Apple Music', category: 'Entertainment', avgAmount: 10.99, variance: 0 },

  // Shopping
  { name: 'Amazon', category: 'Shopping', avgAmount: 45, variance: 30 },
  { name: 'Target', category: 'Shopping', avgAmount: 55, variance: 25 },
  { name: 'Walmart', category: 'Shopping', avgAmount: 40, variance: 20 },
  { name: 'Best Buy', category: 'Shopping', avgAmount: 120, variance: 80 },
  { name: 'Macy\'s', category: 'Shopping', avgAmount: 85, variance: 40 },

  // Groceries
  { name: 'Whole Foods', category: 'Groceries', avgAmount: 85, variance: 25 },
  { name: 'Safeway', category: 'Groceries', avgAmount: 70, variance: 20 },
  { name: 'Trader Joe\'s', category: 'Groceries', avgAmount: 65, variance: 18 },
  { name: 'Costco', category: 'Groceries', avgAmount: 150, variance: 50 },

  // Utilities
  { name: 'PG&E', category: 'Utilities', avgAmount: 120, variance: 30 },
  { name: 'AT&T', category: 'Utilities', avgAmount: 85, variance: 10 },
  { name: 'Comcast', category: 'Utilities', avgAmount: 95, variance: 15 },
  { name: 'Water District', category: 'Utilities', avgAmount: 45, variance: 10 },

  // Healthcare
  { name: 'CVS Pharmacy', category: 'Healthcare', avgAmount: 25, variance: 15 },
  { name: 'Walgreens', category: 'Healthcare', avgAmount: 22, variance: 12 },
  { name: 'Kaiser Permanente', category: 'Healthcare', avgAmount: 35, variance: 20 },

  // Rent/Mortgage
  { name: 'Rent Payment', category: 'Rent/Mortgage', avgAmount: 2200, variance: 0 },

  // Travel
  { name: 'United Airlines', category: 'Travel', avgAmount: 350, variance: 150 },
  { name: 'Hilton Hotels', category: 'Travel', avgAmount: 180, variance: 60 },
  { name: 'Airbnb', category: 'Travel', avgAmount: 220, variance: 100 },
];

// Helper function to generate random amount
function randomAmount(avg: number, variance: number): number {
  const min = Math.max(0, avg - variance);
  const max = avg + variance;
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

// Helper function to generate random date in the past N days
function randomDate(daysAgo: number): Date {
  const now = new Date();
  const past = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const randomTime = past.getTime() + Math.random() * (now.getTime() - past.getTime());
  return new Date(randomTime);
}

// Generate expenses for a user
function generateExpenses(userId: string, categoryMap: Map<string, string>, count: number) {
  const expenses = [];
  const notes = [
    'Business expense',
    'Weekly shopping',
    'Monthly subscription',
    'Work related',
    'Personal',
    null,
    null, // More nulls to make notes optional
    null,
  ];

  for (let i = 0; i < count; i++) {
    const merchant = MERCHANTS[Math.floor(Math.random() * MERCHANTS.length)];
    if (!merchant) continue; // Skip if merchant is undefined

    const amount = randomAmount(merchant.avgAmount, merchant.variance);
    const date = randomDate(180); // 6 months of data
    const categoryId = categoryMap.get(merchant.category);
    const note = notes[Math.floor(Math.random() * notes.length)];

    // 30% of expenses uncategorized (for testing ML suggestions)
    const shouldCategorize = Math.random() > 0.3;

    expenses.push({
      userId,
      date,
      amount,
      merchant: merchant.name,
      categoryId: shouldCategorize && categoryId ? categoryId : null,
      notes: note || null,
      receiptUrl: null, // No S3 URLs for local testing
    });
  }

  // Sort by date (oldest first)
  return expenses.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Generate training data (ML feedback)
function generateTrainingData(userId: string, expenses: any[], categoryMap: Map<string, string>) {
  const trainingData = [];
  const feedbackTypes = ['ACCEPT', 'REJECT', 'MANUAL'];

  // Generate feedback for ~40% of categorized expenses
  const categorizedExpenses = expenses.filter(e => e.categoryId);
  const feedbackCount = Math.floor(categorizedExpenses.length * 0.4);

  for (let i = 0; i < feedbackCount; i++) {
    const expense = categorizedExpenses[Math.floor(Math.random() * categorizedExpenses.length)];
    const feedbackType = feedbackTypes[Math.floor(Math.random() * feedbackTypes.length)];

    // For REJECT feedback, use a different category
    let actualCategory = expense.categoryId;
    if (feedbackType === 'REJECT') {
      const categories = Array.from(categoryMap.values()).filter(c => c !== expense.categoryId);
      actualCategory = categories[Math.floor(Math.random() * categories.length)];
    }

    trainingData.push({
      userId,
      expenseId: null, // Will be set after expenses are created
      predictedCategory: expense.categoryId,
      actualCategory,
      feedbackType: feedbackType as 'ACCEPT' | 'REJECT' | 'MANUAL',
      timestamp: new Date(expense.date.getTime() + Math.random() * 24 * 60 * 60 * 1000), // Same day as expense
    });
  }

  return trainingData;
}

// Generate ML model versions
function generateMlModels(userId: string) {
  const now = new Date();
  const models = [
    {
      userId,
      version: 'v1.0',
      algorithm: 'XGBoost',
      accuracy: 0.7842,
      trainingDate: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
      modelPath: `/models/${userId}/v1.0.pkl`,
    },
    {
      userId,
      version: 'v1.1',
      algorithm: 'XGBoost',
      accuracy: 0.8356,
      trainingDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      modelPath: `/models/${userId}/v1.1.pkl`,
    },
    {
      userId,
      version: 'v1.2',
      algorithm: 'XGBoost',
      accuracy: 0.8891,
      trainingDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      modelPath: `/models/${userId}/v1.2.pkl`,
    },
  ];

  return models;
}

async function main() {
  console.log('🌱 Starting seed process...\n');

  // Clean existing data
  console.log('🧹 Cleaning existing data...');
  await prisma.trainingData.deleteMany();
  await prisma.mlModel.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  console.log('✅ Existing data cleared\n');

  // Create system default categories
  console.log('📁 Creating default categories...');
  const categoryMap = new Map<string, string>();
  for (const cat of DEFAULT_CATEGORIES) {
    const category = await prisma.category.create({
      data: {
        name: cat.name,
        color: cat.color,
        isDefault: true,
        userId: null, // System category
      },
    });
    categoryMap.set(cat.name, category.id);
    console.log(`  ✓ ${cat.name}`);
  }
  console.log(`✅ Created ${DEFAULT_CATEGORIES.length} default categories\n`);

  // Create users and their data
  for (const userData of USERS) {
    console.log(`👤 Creating user: ${userData.email}`);

    // Hash password
    const passwordHash = await bcrypt.hash(userData.password, SALT_ROUNDS);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: userData.email,
        passwordHash,
        name: userData.name,
      },
    });
    console.log(`  ✓ User created: ${user.id}`);

    // Generate expenses (100-150 per user)
    const expenseCount = 100 + Math.floor(Math.random() * 51);
    console.log(`  💰 Generating ${expenseCount} expenses...`);
    const expensesData = generateExpenses(user.id, categoryMap, expenseCount);

    const createdExpenses = [];
    for (const expenseData of expensesData) {
      const expense = await prisma.expense.create({
        data: expenseData,
      });
      createdExpenses.push(expense);
    }
    console.log(`  ✓ Created ${createdExpenses.length} expenses`);

    // Generate training data
    console.log('  🤖 Generating ML training data...');
    const trainingDataRecords = generateTrainingData(user.id, expensesData, categoryMap);

    // Link training data to actual expenses
    for (const record of trainingDataRecords) {
      const randomExpense = createdExpenses[Math.floor(Math.random() * createdExpenses.length)];
      if (!randomExpense) continue; // Skip if no expense found

      await prisma.trainingData.create({
        data: {
          ...record,
          expenseId: randomExpense.id,
        },
      });
    }
    console.log(`  ✓ Created ${trainingDataRecords.length} training records`);

    // Generate ML models
    console.log('  📊 Generating ML model versions...');
    const models = generateMlModels(user.id);
    for (const model of models) {
      await prisma.mlModel.create({
        data: model,
      });
    }
    console.log(`  ✓ Created ${models.length} ML model versions\n`);
  }

  // Summary
  console.log('📊 Seed Summary:');
  console.log('================');
  const userCount = await prisma.user.count();
  const categoryCount = await prisma.category.count();
  const expenseCount = await prisma.expense.count();
  const trainingCount = await prisma.trainingData.count();
  const modelCount = await prisma.mlModel.count();

  console.log(`Users: ${userCount}`);
  console.log(`Categories: ${categoryCount}`);
  console.log(`Expenses: ${expenseCount}`);
  console.log(`Training Data: ${trainingCount}`);
  console.log(`ML Models: ${modelCount}`);
  console.log('\n✨ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
