#!/bin/bash

# PeakSpend Seed Data Installation Script
# This script automates the installation and execution of the seed data

set -e  # Exit on error

SEED_RESOURCES_DIR="/Users/joaocarlinho/gauntlet/bmad/peakspend/seed_resources"
OUTPUT_DIR="/Volumes/LaCie/peakspend_seed_data"
PROJECT_DIR="/Users/joaocarlinho/gauntlet/bmad/peakspend"
BACKEND_DIR="$PROJECT_DIR/backend"

echo "🌱 PeakSpend Seed Data Installation"
echo "===================================="
echo ""

# Check if project exists
if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ Error: Project directory not found at $PROJECT_DIR"
    exit 1
fi

# Step 1: Copy seed file
echo "📋 Step 1: Copying seed.ts to backend/prisma..."
cp "$SEED_RESOURCES_DIR/seed.ts" "$BACKEND_DIR/prisma/seed.ts"
echo "✅ Seed file copied"
echo ""

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Step 2: Check if ts-node is installed
echo "🔍 Step 2: Checking for ts-node..."
cd "$BACKEND_DIR"
if ! npm list ts-node --depth=0 &>/dev/null; then
    echo "📦 Installing ts-node as dev dependency..."
    npm install -D ts-node
    echo "✅ ts-node installed"
else
    echo "✅ ts-node already installed"
fi
echo ""

# Step 3: Update package.json with prisma seed config
echo "⚙️  Step 3: Updating package.json with Prisma seed config..."
if ! grep -q '"seed"' "$BACKEND_DIR/package.json"; then
    echo "Adding Prisma seed configuration..."
    # This is a simple approach - you may need to do this manually if it fails
    echo "⚠️  Please manually add the following to backend/package.json:"
    echo ""
    echo '  "prisma": {'
    echo '    "seed": "ts-node prisma/seed.ts"'
    echo '  }'
    echo ""
else
    echo "✅ Prisma seed config already exists"
fi
echo ""

# Step 4: Check if database is running
echo "🗄️  Step 4: Checking database..."
if docker ps | grep -q peakspend.*postgres; then
    echo "✅ PostgreSQL container is running"
else
    echo "⚠️  PostgreSQL container not running"
    echo "Starting database with docker-compose..."
    cd "$PROJECT_DIR"
    docker-compose up -d postgres
    echo "⏳ Waiting for database to be ready..."
    sleep 5
    echo "✅ Database started"
fi
echo ""

# Step 5: Generate Prisma Client
echo "🔧 Step 5: Generating Prisma Client..."
cd "$BACKEND_DIR"
npx prisma generate
echo "✅ Prisma Client generated"
echo ""

# Step 6: Run migrations
echo "🔄 Step 6: Running database migrations..."
npx prisma migrate deploy
echo "✅ Migrations complete"
echo ""

# Step 7: Run seed
echo "🌱 Step 7: Running seed script..."
echo "This will:"
echo "  - Clear all existing data"
echo "  - Create 3 test users"
echo "  - Generate 10 default categories"
echo "  - Create 300+ realistic expenses"
echo "  - Generate ML training data and models"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npx prisma db seed
    echo ""
    echo "✨ Seed completed successfully!"
else
    echo "❌ Seed cancelled"
    exit 0
fi
echo ""

# Summary
echo "📊 Installation Complete!"
echo "========================"
echo ""
echo "Test Account Credentials:"
echo "  • demo@peakspend.com / demo1234"
echo "  • test@peakspend.com / test1234"
echo "  • user@peakspend.com / user1234"
echo ""
echo "Next Steps:"
echo "  1. Start the app: cd $PROJECT_DIR && docker-compose up"
echo "  2. Visit: http://localhost:5173"
echo "  3. Login with any test account above"
echo ""
echo "To re-seed data: cd $BACKEND_DIR && npx prisma db seed"
echo ""
