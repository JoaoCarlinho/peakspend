# PeakSpend Seed Data - Quick Start

## 🚀 One-Command Installation

```bash
/Users/joaocarlinho/gauntlet/bmad/peakspend/seed_resources/install.sh
```

This script will:
- ✅ Copy seed.ts to backend/prisma
- ✅ Install dependencies (ts-node)
- ✅ Start PostgreSQL if needed
- ✅ Run migrations
- ✅ Generate test data

---

## 🔑 Test Account Credentials

| Email | Password |
|-------|----------|
| demo@peakspend.com | demo1234 |
| test@peakspend.com | test1234 |
| user@peakspend.com | user1234 |

---

## 📊 What Gets Created

- **3 Users** with hashed passwords
- **10 Default Categories** (Food, Transport, etc.)
- **~375 Expenses** across all users (6 months of data)
- **~150 ML Training Records** (user feedback)
- **9 ML Model Versions** (3 per user, showing accuracy improvement)

---

## 🎯 Manual Installation (if script fails)

```bash
# 1. Copy seed file
cp /Users/joaocarlinho/gauntlet/bmad/peakspend/seed_resources/seed.ts \
   /Users/joaocarlinho/gauntlet/bmad/peakspend/backend/prisma/seed.ts

# 2. Install ts-node
cd /Users/joaocarlinho/gauntlet/bmad/peakspend/backend
npm install -D ts-node

# 3. Add to package.json (manually)
# "prisma": {
#   "seed": "ts-node prisma/seed.ts"
# }

# 4. Start database
cd /Users/joaocarlinho/gauntlet/bmad/peakspend
docker-compose up -d postgres

# 5. Generate Prisma client
cd backend
npx prisma generate

# 6. Run migrations
npx prisma migrate deploy

# 7. Run seed
npx prisma db seed
```

---

## 🧪 Testing After Seeding

### 1. Start the Application

```bash
cd /Users/joaocarlinho/gauntlet/bmad/peakspend
docker-compose up --build
```

### 2. Access the App

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3000
- **ML Service:** http://localhost:8000

### 3. Login

Use any test account:
- Email: `demo@peakspend.com`
- Password: `demo1234`

### 4. Explore Features

✅ **Dashboard:** See 100+ expenses
✅ **Categories:** 10 default categories
✅ **ML Suggestions:** View uncategorized expenses with ML predictions
✅ **Analytics:** 6 months of spending trends
✅ **Search & Filter:** Find specific expenses

---

## 🔄 Reset Data

To wipe and regenerate fresh data:

```bash
cd /Users/joaocarlinho/gauntlet/bmad/peakspend/backend
npx prisma db seed
```

---

## 📁 Files in This Directory

| File | Purpose |
|------|---------|
| `seed.ts` | Main seed script |
| `README.md` | Detailed documentation |
| `install.sh` | Automated installation |
| `DATA_SUMMARY.md` | Dataset statistics |
| `QUICK_START.md` | This file |

---

## 🐛 Troubleshooting

### Database Not Running
```bash
docker-compose up -d postgres
sleep 5  # Wait for startup
```

### Prisma Client Not Found
```bash
npx prisma generate
```

### Unique Constraint Error
```bash
# The seed script cleans data first, but if issues persist:
npx prisma migrate reset
npx prisma db seed
```

### Module Not Found: ts-node
```bash
npm install -D ts-node
```

---

## 💡 Tips

- **Each user has unique spending patterns** (different amounts, merchants)
- **ML accuracy improves over time** (78% → 89% across versions)
- **30% of expenses uncategorized** to test ML suggestions
- **Realistic merchant names** for authentic testing
- **6 months of data** for trend analysis

---

## 📞 Need Help?

1. Check `README.md` for detailed instructions
2. Review `DATA_SUMMARY.md` for dataset details
3. Verify database is running: `docker ps | grep postgres`
4. Check Prisma connection: `npx prisma db pull`

---

**Generated:** 2025-11-07
**For:** PeakSpend Expense Tracking App
**Resources:** `/Users/joaocarlinho/gauntlet/bmad/peakspend/seed_resources/`
**Output:** `/Volumes/LaCie/peakspend_seed_data/`
