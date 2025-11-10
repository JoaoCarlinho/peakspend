# PeakSpend Test Data Summary

## Overview

This seed dataset creates realistic financial data for testing the PeakSpend expense tracking application with ML categorization features.

---

## Test Users (3)

| Email | Password | Name | Expenses | Purpose |
|-------|----------|------|----------|---------|
| demo@peakspend.com | demo1234 | Demo User | 100-150 | Primary demo account |
| test@peakspend.com | test1234 | Test User | 100-150 | Testing account |
| user@peakspend.com | user1234 | Sample User | 100-150 | Sample account |

**Total Users:** 3

---

## Categories (10 System Defaults)

| Category | Color | Typical Amount | Use Case |
|----------|-------|----------------|----------|
| Food & Dining | #FF6B6B | $6-30 | Restaurants, cafes, takeout |
| Transportation | #4ECDC4 | $5-60 | Uber, gas, public transit |
| Entertainment | #FFE66D | $10-20 | Streaming, movies, concerts |
| Shopping | #95E1D3 | $20-200 | Amazon, Target, retail |
| Healthcare | #F38181 | $20-50 | Pharmacy, medical |
| Utilities | #AA96DA | $45-150 | Electric, internet, phone |
| Rent/Mortgage | #FCBAD3 | $2200 | Monthly housing |
| Groceries | #A8E6CF | $60-150 | Weekly food shopping |
| Travel | #FFD3B6 | $150-500 | Flights, hotels, Airbnb |
| Other | #D5AAFF | Varies | Miscellaneous |

---

## Merchants (35 Realistic Businesses)

### Food & Dining (6)
- **Starbucks:** $4.50-$8.50 (frequent, 2-3x/week)
- **Chipotle:** $9-$15
- **Subway:** $7-$11
- **McDonald's:** $6-$10
- **Pizza Hut:** $20-$30
- **Domino's Pizza:** $18-$26

### Transportation (5)
- **Uber:** $7-$23 (variable distance)
- **Lyft:** $7-$21 (variable distance)
- **Shell Gas Station:** $35-$55 (weekly fill-up)
- **Chevron:** $36-$60 (weekly fill-up)
- **BART:** $4.50-$6.50 (daily commute)

### Entertainment (4)
- **Netflix:** $15.99 (fixed monthly)
- **Spotify:** $9.99 (fixed monthly)
- **AMC Theatres:** $13-$19
- **Apple Music:** $10.99 (fixed monthly)

### Shopping (5)
- **Amazon:** $15-$75 (highly variable)
- **Target:** $30-$80
- **Walmart:** $20-$60
- **Best Buy:** $40-$200 (electronics)
- **Macy's:** $45-$125 (clothing)

### Groceries (4)
- **Whole Foods:** $60-$110 (premium)
- **Safeway:** $50-$90
- **Trader Joe's:** $47-$83
- **Costco:** $100-$200 (bulk)

### Utilities (4)
- **PG&E:** $90-$150 (monthly electric/gas)
- **AT&T:** $75-$95 (monthly phone)
- **Comcast:** $80-$110 (monthly internet/cable)
- **Water District:** $35-$55 (monthly water)

### Healthcare (3)
- **CVS Pharmacy:** $10-$40
- **Walgreens:** $10-$34
- **Kaiser Permanente:** $15-$55 (copay)

### Rent/Mortgage (1)
- **Rent Payment:** $2200 (fixed monthly)

### Travel (3)
- **United Airlines:** $200-$500 (flights)
- **Hilton Hotels:** $120-$240 (per night)
- **Airbnb:** $120-$320 (vacation rentals)

---

## Expense Statistics

### Per User
- **Count:** 100-150 expenses
- **Date Range:** 6 months (180 days)
- **Total Amount:** $15,000-$25,000
- **Categorization:**
  - 70% pre-categorized
  - 30% uncategorized (for ML testing)

### Across All Users (~375 total expenses)
- **Total Dataset Value:** ~$60,000
- **Average Expense:** $160
- **Median Expense:** $45
- **Range:** $4.50-$2200

### Frequency Patterns
- **Daily:** Coffee, commute (5-10 transactions)
- **Weekly:** Groceries, gas (2-4 transactions)
- **Monthly:** Rent, subscriptions, utilities (10-15 transactions)
- **Occasional:** Travel, large shopping (1-3 transactions)

---

## ML Training Data

### Per User
- **Training Records:** 40-50
- **Feedback Types:**
  - **ACCEPT:** 60% (user accepted ML suggestion)
  - **REJECT:** 25% (user rejected, chose different category)
  - **MANUAL:** 15% (user manually categorized)

### ML Model Versions (3 per user)

| Version | Algorithm | Accuracy | Training Date | Notes |
|---------|-----------|----------|---------------|-------|
| v1.0 | XGBoost | 78.42% | 90 days ago | Initial model |
| v1.1 | XGBoost | 83.56% | 30 days ago | First improvement |
| v1.2 | XGBoost | 88.91% | 7 days ago | Latest model |

**Shows:** Progressive accuracy improvement through continuous learning

---

## Use Cases & Test Scenarios

### 1. Authentication Testing
- Login with 3 different test accounts
- Test password hashing (bcrypt)
- JWT token generation and validation
- Protected route access

### 2. Expense Management
- View paginated expense lists
- Filter by category, date range
- Search by merchant name
- Create/edit/delete expenses
- Bulk operations

### 3. ML Categorization Testing
- **Cold Start:** New expense without history
- **Pattern Recognition:** Multiple Starbucks purchases → Food & Dining
- **High Confidence:** 50+ expenses → 85%+ accuracy
- **Edge Cases:** Amazon (could be Shopping, Groceries, or Other)

### 4. Feedback Loop
- Accept ML suggestion
- Reject and select correct category
- Manual categorization
- Model retraining trigger

### 5. Analytics & Insights
- Monthly spending trends
- Category breakdown pie charts
- Top merchants by spend
- Year-over-year comparisons
- Budget tracking vs actual

### 6. Performance Testing
- Load 150 expenses in UI
- Fast filtering/sorting
- Responsive pagination
- Efficient database queries

---

## Realistic Spending Profile

### Monthly Budget Breakdown (Average User)

| Category | Monthly Spend | % of Total |
|----------|--------------|------------|
| Rent/Mortgage | $2,200 | 52% |
| Groceries | $300 | 7% |
| Transportation | $250 | 6% |
| Utilities | $180 | 4% |
| Food & Dining | $200 | 5% |
| Shopping | $150 | 4% |
| Entertainment | $50 | 1% |
| Healthcare | $40 | 1% |
| Other | $130 | 3% |
| **Total** | **~$3,500** | **100%** |

### Merchant Loyalty Patterns
- **Starbucks:** 8-12 visits/month (coffee habit)
- **Uber/Lyft:** 6-10 rides/month (regular commuter)
- **Whole Foods:** 4 visits/month (weekly grocery shopper)
- **Netflix/Spotify:** 1 charge/month (subscriber)

---

## Data Quality Features

### Realistic Characteristics
✅ **Natural variance** in amounts (not rounded numbers)
✅ **Temporal patterns** (weekly groceries, monthly bills)
✅ **Seasonal variation** (more travel in summer months)
✅ **Missing data** (30% uncategorized, notes optional)
✅ **Real merchants** (actual brand names)
✅ **Logical categories** (merchant → category mapping)

### ML Training Readiness
✅ **Sufficient volume** (100+ expenses per user)
✅ **Diverse categories** (10 different types)
✅ **Historical depth** (6 months of data)
✅ **Feedback examples** (40-50 training records)
✅ **Model versioning** (3 versions showing improvement)

---

## File Locations

After installation:
- **Seed Script:** `backend/prisma/seed.ts`
- **Generated Data:** PostgreSQL database
- **Run Command:** `npx prisma db seed`

Storage location:
- **Source:** `/Volumes/LaCie/peakspend_seed_data/`
- **Includes:** seed.ts, README.md, install.sh, DATA_SUMMARY.md

---

## Reset & Regenerate

To get fresh data with different random values:

```bash
cd /Users/joaocarlinho/gauntlet/bmad/peakspend/backend
npx prisma db seed
```

This will:
1. Delete all existing data
2. Generate new UUIDs
3. Create new random amounts (within ranges)
4. Generate new random dates
5. Shuffle merchant selections

**Note:** User credentials remain the same (demo@peakspend.com / demo1234, etc.)
