-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('ACCEPT', 'REJECT', 'MANUAL');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin', 'security');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('savings', 'spending_limit', 'reduction');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('active', 'achieved', 'failed', 'abandoned');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "termsAcceptedAt" TIMESTAMP(3),
    "termsVersion" TEXT,
    "privacyPolicyAcceptedAt" TIMESTAMP(3),
    "privacyPolicyVersion" TEXT,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "analyticsConsent" BOOLEAN NOT NULL DEFAULT true,
    "mlTrainingConsent" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "merchant" TEXT,
    "categoryId" UUID,
    "notes" TEXT,
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml_models" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "accuracy" DECIMAL(5,4),
    "trainingDate" TIMESTAMP(3) NOT NULL,
    "modelPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_data" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "expenseId" UUID,
    "predictedCategory" TEXT,
    "actualCategory" TEXT,
    "feedbackType" "FeedbackType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "sequenceNum" SERIAL NOT NULL,
    "previousHash" TEXT,
    "contentHash" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID,
    "sessionId" TEXT,
    "requestId" TEXT,
    "endpoint" TEXT,
    "requestHash" TEXT,
    "responseHash" TEXT,
    "securityDecision" TEXT,
    "tier" INTEGER,
    "anomalyScore" DOUBLE PRECISION,
    "patternsMatched" TEXT[],
    "processingMs" INTEGER,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "legalHoldReason" TEXT,
    "legalHoldSetAt" TIMESTAMP(3),
    "legalHoldSetBy" UUID,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_prompts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "system_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" UUID NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "userId" UUID,
    "sessionId" TEXT,
    "requestId" TEXT,
    "details" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "alertSent" BOOLEAN NOT NULL DEFAULT false,
    "alertDestinations" TEXT[],

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountNumberEncrypted" TEXT NOT NULL,
    "routingNumberEncrypted" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "nickname" TEXT,
    "bankName" TEXT,
    "accountType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_cards" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cardNumberEncrypted" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "expiryMonth" INTEGER NOT NULL,
    "expiryYear" INTEGER NOT NULL,
    "cardType" TEXT NOT NULL,
    "nickname" TEXT,
    "cardholderName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_goals" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "goalType" "GoalType" NOT NULL DEFAULT 'savings',
    "category" TEXT,
    "targetAmount" DECIMAL(10,2) NOT NULL,
    "currentAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "expenses_userId_idx" ON "expenses"("userId");

-- CreateIndex
CREATE INDEX "expenses_categoryId_idx" ON "expenses"("categoryId");

-- CreateIndex
CREATE INDEX "expenses_date_idx" ON "expenses"("date");

-- CreateIndex
CREATE INDEX "expenses_userId_date_idx" ON "expenses"("userId", "date");

-- CreateIndex
CREATE INDEX "categories_userId_idx" ON "categories"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_userId_name_key" ON "categories"("userId", "name");

-- CreateIndex
CREATE INDEX "ml_models_userId_idx" ON "ml_models"("userId");

-- CreateIndex
CREATE INDEX "ml_models_version_idx" ON "ml_models"("version");

-- CreateIndex
CREATE INDEX "ml_models_userId_trainingDate_idx" ON "ml_models"("userId", "trainingDate");

-- CreateIndex
CREATE INDEX "training_data_userId_idx" ON "training_data"("userId");

-- CreateIndex
CREATE INDEX "training_data_expenseId_idx" ON "training_data"("expenseId");

-- CreateIndex
CREATE INDEX "training_data_timestamp_idx" ON "training_data"("timestamp");

-- CreateIndex
CREATE INDEX "training_data_userId_timestamp_idx" ON "training_data"("userId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_sequenceNum_key" ON "audit_logs"("sequenceNum");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_securityDecision_idx" ON "audit_logs"("securityDecision");

-- CreateIndex
CREATE INDEX "audit_logs_endpoint_idx" ON "audit_logs"("endpoint");

-- CreateIndex
CREATE INDEX "audit_logs_legalHold_timestamp_idx" ON "audit_logs"("legalHold", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "system_prompts_name_key" ON "system_prompts"("name");

-- CreateIndex
CREATE INDEX "system_prompts_name_isActive_idx" ON "system_prompts"("name", "isActive");

-- CreateIndex
CREATE INDEX "security_events_timestamp_idx" ON "security_events"("timestamp");

-- CreateIndex
CREATE INDEX "security_events_eventType_idx" ON "security_events"("eventType");

-- CreateIndex
CREATE INDEX "security_events_status_idx" ON "security_events"("status");

-- CreateIndex
CREATE INDEX "security_events_userId_idx" ON "security_events"("userId");

-- CreateIndex
CREATE INDEX "chat_sessions_userId_idx" ON "chat_sessions"("userId");

-- CreateIndex
CREATE INDEX "chat_messages_userId_idx" ON "chat_messages"("userId");

-- CreateIndex
CREATE INDEX "chat_messages_sessionId_idx" ON "chat_messages"("sessionId");

-- CreateIndex
CREATE INDEX "chat_messages_sessionId_createdAt_idx" ON "chat_messages"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "bank_accounts_userId_idx" ON "bank_accounts"("userId");

-- CreateIndex
CREATE INDEX "payment_cards_userId_idx" ON "payment_cards"("userId");

-- CreateIndex
CREATE INDEX "budget_goals_userId_idx" ON "budget_goals"("userId");

-- CreateIndex
CREATE INDEX "budget_goals_userId_status_idx" ON "budget_goals"("userId", "status");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml_models" ADD CONSTRAINT "ml_models_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_data" ADD CONSTRAINT "training_data_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_data" ADD CONSTRAINT "training_data_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_cards" ADD CONSTRAINT "payment_cards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_goals" ADD CONSTRAINT "budget_goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
