-- AlterTable
ALTER TABLE "users" ADD COLUMN     "analyticsConsent" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mlTrainingConsent" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "privacyPolicyAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "privacyPolicyVersion" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;
