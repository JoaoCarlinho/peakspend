# PeakSpend Test Data Seed Script

This directory contains seed resources to generate realistic test data for the PeakSpend application. The seed data will be output to `/Volumes/LaCie/peakspend_seed_data/`.

## What Gets Generated

### Users (3 test accounts)
- **demo@peakspend.com** (password: `demo1234`)
- **test@peakspend.com** (password: `test1234`)
- **user@peakspend.com** (password: `user1234`)

### System Default Categories (10)
- Food & Dining
- Transportation
- Entertainment
- Shopping
- Healthcare
- Utilities
- Rent/Mortgage
- Groceries
- Travel
- Other

### Per User Data
- **100-150 expenses** spanning 6 months
- **Realistic merchants** (Starbucks, Uber, Amazon, etc.)
- **Varied amounts** ($5-$500+)
- **70% categorized, 30% uncategorized** (for ML testing)
- **40-50 ML training feedback records**
- **3 ML model versions** (showing accuracy improvement)

### Total Dataset
- ~3 users
- ~10 categories
- ~375 expenses
- ~150 training records
- ~9 ML model versions

## Installation

### Quick Start (Automated)

Run the installation script from the project root:

```bash
/Users/joaocarlinho/gauntlet/bmad/peakspend/seed_resources/install.sh
```

This will automatically:
- Copy seed.ts to backend/prisma
- Install dependencies
- Start PostgreSQL
- Run migrations
- Generate seed data

### Manual Installation

#### Step 1: Copy to Backend Directory

```bash
cp /Users/joaocarlinho/gauntlet/bmad/peakspend/seed_resources/seed.ts /Users/joaocarlinho/gauntlet/bmad/peakspend/backend/prisma/seed.ts
```

### Step 2: Update Backend package.json

Add this to `backend/package.json`:

```json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

### Step 3: Install ts-node (if not already installed)

```bash
cd /Users/joaocarlinho/gauntlet/bmad/peakspend/backend
npm install -D ts-node
```

### Step 4: Ensure Database is Running

```bash
# Start PostgreSQL with Docker
docker-compose up -d postgres
```

### Step 5: Run Migrations (if needed)

```bash
cd /Users/joaocarlinho/gauntlet/bmad/peakspend/backend
npx prisma migrate deploy
```

### Step 6: Run Seed Script

```bash
cd /Users/joaocarlinho/gauntlet/bmad/peakspend/backend
npx prisma db seed
```

## Expected Output

```
🌱 Starting seed process...

🧹 Cleaning existing data...
✅ Existing data cleared

📁 Creating default categories...
  ✓ Food & Dining
  ✓ Transportation
  ...
✅ Created 10 default categories

👤 Creating user: demo@peakspend.com
  ✓ User created: uuid-here
  💰 Generating 125 expenses...
  ✓ Created 125 expenses
  🤖 Generating ML training data...
  ✓ Created 50 training records
  📊 Generating ML model versions...
  ✓ Created 3 ML model versions

...

📊 Seed Summary:
================
Users: 3
Categories: 10
Expenses: 375
Training Data: 150
ML Models: 9

✨ Seed completed successfully!
```

## Usage After Seeding

### Login to Test Accounts

Use any of these credentials:
- Email: `demo@peakspend.com`, Password: `demo1234`
- Email: `test@peakspend.com`, Password: `test1234`
- Email: `user@peakspend.com`, Password: `user1234`

### Start the Application

```bash
# From project root
cd /Users/joaocarlinho/gauntlet/bmad/peakspend
docker-compose up --build

# Access:
# Frontend: http://localhost:5173
# Backend: http://localhost:3000
# ML Service: http://localhost:8000
```

### What You Can Test

1. **Authentication**
   - Login with test accounts
   - Register new users
   - Protected routes

2. **Expense Management**
   - View 100+ expenses per user
   - Create/edit/delete expenses
   - Filter by category, date
   - Search expenses

3. **Category Management**
   - View default categories
   - Create custom categories
   - Assign categories to expenses

4. **ML Categorization**
   - View ML suggestions for uncategorized expenses
   - Accept/reject ML suggestions
   - See ML accuracy improvements over time (v1.0: 78% → v1.2: 89%)

5. **Analytics & Insights**
   - Spending trends over 6 months
   - Category breakdowns
   - Monthly/weekly patterns

## Resetting Data

To reset and regenerate fresh data:

```bash
cd /Users/joaocarlinho/gauntlet/bmad/peakspend/backend
npx prisma db seed
```

This will:
1. Delete all existing data
2. Regenerate fresh test data
3. Create new UUIDs for all records

## Data Characteristics

### Realistic Spending Patterns

- **Coffee habit:** Starbucks 2-3x/week ($5-8)
- **Commute:** Uber/Lyft rides ($10-25)
- **Groceries:** Weekly trips ($60-110)
- **Subscriptions:** Monthly (Netflix, Spotify)
- **Utilities:** Monthly bills ($45-150)
- **Rent:** Monthly payment ($2200)
- **Shopping:** Irregular ($20-200)
- **Travel:** Occasional large expenses ($300-500)

### ML Training Scenarios

1. **Cold Start:** New user sees random suggestions
2. **Learning Phase:** After 20+ expenses, patterns emerge
3. **High Accuracy:** After 50+ expenses, 85%+ accuracy
4. **Continuous Learning:** User feedback improves model

### Date Distribution

- Expenses spread evenly over 6 months
- More recent expenses have higher likelihood
- Realistic clustering (e.g., weekly grocery trips)

## Troubleshooting

### "PrismaClient initialization error"
- Ensure database is running: `docker-compose up -d postgres`
- Check DATABASE_URL in backend/.env

### "Module not found: ts-node"
- Install: `npm install -D ts-node`

### "Unique constraint failed"
- The seed script cleans all data first
- If issues persist, manually reset: `npx prisma migrate reset`

### "Cannot find module @prisma/client"
- Generate Prisma client: `npx prisma generate`

## Notes

- All passwords are hashed with bcrypt (salt rounds: 12)
- No real AWS S3 URLs (receiptUrl = null)
- Amounts are realistic for US market
- Merchants are real brands for authenticity
- Categories use pleasant color palette for UI
