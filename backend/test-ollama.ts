import { ollamaService } from './src/services/ollama.service';

/**
 * Test script for Ollama integration
 * Tests both Use Case 1 (Receipt OCR) and Use Case 4 (Spending Insights)
 */

async function testOllamaIntegration() {
  console.log('🧪 Testing Ollama Integration...\n');

  // Test 1: Check Ollama availability
  console.log('1. Checking Ollama availability...');
  const isAvailable = await ollamaService.isAvailable();
  console.log(`   Ollama available: ${isAvailable ? '✅ YES' : '❌ NO'}\n`);

  if (!isAvailable) {
    console.log('⚠️  Ollama is not available. Please start Ollama service.');
    console.log('   Run: ollama serve');
    process.exit(1);
  }

  // Test 2: Receipt OCR Enhancement (Use Case 1)
  console.log('2. Testing Receipt OCR Enhancement (Use Case 1)...');
  const receiptText = `Whole Foods Market
123 Main St
Date: 2025-11-06

Organic Bananas    $3.99
Almond Milk        $4.50
Bread              $3.25

Subtotal          $11.74
Tax                $0.94
TOTAL             $12.68

Thank you!`;

  try {
    const receiptResult = await ollamaService.enhanceReceiptOCR(receiptText);
    console.log('   Receipt OCR Result:');
    console.log('   - Merchant:', receiptResult.merchant);
    console.log('   - Amount:', receiptResult.amount);
    console.log('   - Date:', receiptResult.date);
    console.log('   - Category Hint:', receiptResult.category_hint);
    console.log('   - Confidence:', receiptResult.confidence);
    console.log('   - Items:', receiptResult.items?.length || 0);
    console.log('   ✅ Receipt OCR test passed\n');
  } catch (error) {
    console.log('   ❌ Receipt OCR test failed:', error);
    console.log('');
  }

  // Test 3: Spending Insights (Use Case 4)
  console.log('3. Testing Spending Insights (Use Case 4)...');
  const spendingData = {
    totalExpenses: 1250.50,
    categoryBreakdown: [
      { category: 'Groceries', amount: 450.25, count: 12 },
      { category: 'Dining', amount: 325.75, count: 8 },
      { category: 'Transportation', amount: 200.00, count: 6 },
      { category: 'Entertainment', amount: 175.50, count: 5 },
      { category: 'Shopping', amount: 99.00, count: 2 },
    ],
    timeframe: 'last 30 days',
    previousPeriodTotal: 1100.00,
    topMerchants: [
      { merchant: 'Whole Foods', amount: 250.00 },
      { merchant: 'Starbucks', amount: 125.50 },
      { merchant: 'Uber', amount: 100.00 },
    ],
  };

  try {
    const insights = await ollamaService.generateSpendingInsights(spendingData);
    console.log(`   Generated ${insights.length} insights:`);
    insights.forEach((insight, index) => {
      console.log(`   ${index + 1}. [${insight.type}] ${insight.title}`);
      console.log(`      ${insight.description}`);
      console.log(`      Impact: ${insight.impact}`);
      console.log(`      Confidence: ${insight.confidence}`);
    });
    console.log('   ✅ Spending Insights test passed\n');
  } catch (error) {
    console.log('   ❌ Spending Insights test failed:', error);
    console.log('');
  }

  // Test 4: Category Recommendations
  console.log('4. Testing Category Recommendations...');
  const categoryExpenses = [
    { merchant: 'Whole Foods', amount: 125.50, date: '2025-11-01' },
    { merchant: 'Safeway', amount: 88.25, date: '2025-11-05' },
    { merchant: 'Trader Joes', amount: 92.75, date: '2025-11-10' },
    { merchant: 'Farmers Market', amount: 45.00, date: '2025-11-15' },
  ];

  try {
    const recommendations = await ollamaService.getCategoryRecommendations(
      'Groceries',
      categoryExpenses
    );
    console.log(`   Generated ${recommendations.length} recommendations:`);
    recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. ${rec.title}`);
      console.log(`      ${rec.description}`);
    });
    console.log('   ✅ Category Recommendations test passed\n');
  } catch (error) {
    console.log('   ❌ Category Recommendations test failed:', error);
    console.log('');
  }

  console.log('🎉 All Ollama tests completed!');
}

testOllamaIntegration().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
