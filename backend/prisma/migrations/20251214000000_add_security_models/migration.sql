-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin', 'security');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'user';

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

-- AuditLog Immutability Trigger (AC #6)
-- Function to enforce immutability on audit_logs table
CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'AuditLog is immutable: UPDATE not allowed';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AuditLog is immutable: DELETE not allowed';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger definition to prevent UPDATE/DELETE on audit_logs
CREATE TRIGGER enforce_audit_immutability
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- Permission Revocation (AC #7)
-- Note: The application user must be known. Using common patterns:
-- REVOKE UPDATE, DELETE ON "audit_logs" FROM app_user;
-- Uncomment and modify the above line with your actual database user
-- For development with user 'dev':
-- REVOKE UPDATE, DELETE ON "audit_logs" FROM dev;
