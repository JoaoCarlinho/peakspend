#!/bin/sh
# Database migration and optional reset script
# Set RESET_DATABASE=true to drop and recreate schema (destructive!)
# Set SEED_DATABASE=true to seed demo data

set -e

echo "=== Database Migration ==="

# Check if RESET_DATABASE flag is set
if [ "$RESET_DATABASE" = "true" ]; then
    echo "RESET_DATABASE=true - Dropping all tables..."

    # Drop and recreate the public schema
    npx prisma db execute --schema prisma/schema.prisma --stdin <<EOF
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;
EOF

    echo "Schema dropped and recreated"
fi

# Run migrations
echo "Running migrations..."
npx prisma migrate deploy

# Seed demo users and categories if requested
if [ "$SEED_DATABASE" = "true" ]; then
    echo "Seeding demo data..."
    npx prisma db execute --schema prisma/schema.prisma --stdin <<'SEEDEOF'
-- Insert demo users
INSERT INTO users (id, email, "passwordHash", name, role, "createdAt", "updatedAt", "termsAcceptedAt", "termsVersion", "privacyPolicyAcceptedAt", "privacyPolicyVersion", "marketingConsent", "analyticsConsent", "mlTrainingConsent")
VALUES
  (gen_random_uuid(), 'demo@peakspend.com', '$2b$12$JE9oY8qRi.KD1Sd.K8YlfOOXYMsUiOo8uB0yDjDrnx.yMIDx9YPfy', 'Demo User', 'user', NOW(), NOW(), NOW(), '1.0', NOW(), '1.0', false, true, true),
  (gen_random_uuid(), 'test@peakspend.com', '$2b$12$mIAbDhPCqQGaEWQ2BReZm.T47F/CTVFZTKiK6ugX/H5/ykYSOanPK', 'Test User', 'user', NOW(), NOW(), NOW(), '1.0', NOW(), '1.0', false, true, true),
  (gen_random_uuid(), 'user@peakspend.com', '$2b$12$6M/GOFfXCeKQDQr2KoonEO.6Y7OfZ85R7tZpIS0x7xvsGV7fwfS..', 'Sample User', 'user', NOW(), NOW(), NOW(), '1.0', NOW(), '1.0', false, true, true),
  (gen_random_uuid(), 'admin@peakspend.com', '$2b$12$JE9oY8qRi.KD1Sd.K8YlfOOXYMsUiOo8uB0yDjDrnx.yMIDx9YPfy', 'Admin User', 'admin', NOW(), NOW(), NOW(), '1.0', NOW(), '1.0', false, true, true)
ON CONFLICT (email) DO NOTHING;

-- Insert default categories (system-wide, no userId)
INSERT INTO categories (id, "userId", name, color, "isDefault", "createdAt")
VALUES
  (gen_random_uuid(), NULL, 'Food & Dining', '#FF6B6B', true, NOW()),
  (gen_random_uuid(), NULL, 'Transportation', '#4ECDC4', true, NOW()),
  (gen_random_uuid(), NULL, 'Entertainment', '#FFE66D', true, NOW()),
  (gen_random_uuid(), NULL, 'Shopping', '#95E1D3', true, NOW()),
  (gen_random_uuid(), NULL, 'Healthcare', '#F38181', true, NOW()),
  (gen_random_uuid(), NULL, 'Utilities', '#AA96DA', true, NOW()),
  (gen_random_uuid(), NULL, 'Rent/Mortgage', '#FCBAD3', true, NOW()),
  (gen_random_uuid(), NULL, 'Groceries', '#A8E6CF', true, NOW()),
  (gen_random_uuid(), NULL, 'Travel', '#FFD3B6', true, NOW()),
  (gen_random_uuid(), NULL, 'Other', '#D5AAFF', true, NOW())
ON CONFLICT ("userId", name) DO NOTHING;
SEEDEOF
    echo "Demo data seeded"
fi

echo "=== Migration complete ==="

# Start the server
exec node dist/server.js
