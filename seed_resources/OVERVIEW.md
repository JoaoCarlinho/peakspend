# PeakSpend Seed Resources

## Directory Structure

This directory (`/Users/joaocarlinho/gauntlet/bmad/peakspend/seed_resources/`) contains the seed resources for generating test data.

**Output Directory:** `/Volumes/LaCie/peakspend_seed_data/`

## Files

| File | Purpose |
|------|---------|
| `seed.ts` | Main seed script with realistic test data generation |
| `install.sh` | Automated installation and seeding script |
| `README.md` | Comprehensive documentation and manual instructions |
| `QUICK_START.md` | Quick reference for common tasks |
| `DATA_SUMMARY.md` | Statistical breakdown of generated data |
| `OVERVIEW.md` | This file |

## Quick Start

Run the automated installation:

```bash
/Users/joaocarlinho/gauntlet/bmad/peakspend/seed_resources/install.sh
```

This will:
1. Copy `seed.ts` to `backend/prisma/seed.ts`
2. Install dependencies (ts-node)
3. Start PostgreSQL container
4. Run database migrations
5. Generate test data (users, categories, expenses, ML data)

## Output

Generated data is stored in the PostgreSQL database:
- **Connection:** postgresql://dev:devpassword@localhost:5432/peakspend
- **Users:** 3 test accounts
- **Expenses:** ~343 realistic transactions
- **Categories:** 10 default categories
- **ML Data:** Training records and model versions

## Documentation

For detailed information, see:
- **Quick Start:** [QUICK_START.md](QUICK_START.md)
- **Full Manual:** [README.md](README.md)
- **Data Statistics:** [DATA_SUMMARY.md](DATA_SUMMARY.md)

## Test Credentials

| Email | Password |
|-------|----------|
| demo@peakspend.com | demo1234 |
| test@peakspend.com | test1234 |
| user@peakspend.com | user1234 |

All passwords are bcrypt-hashed with 12 salt rounds.

---

**Updated:** 2025-11-07
**Project:** PeakSpend Expense Tracking App
