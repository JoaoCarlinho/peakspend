import { PrismaClient } from '../generated/prisma/client';
import type { UpdateConsentInput } from '../validation/consent.validation';

const prisma = new PrismaClient();

export class ConsentService {
  async getUserConsent(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        termsAcceptedAt: true,
        termsVersion: true,
        privacyPolicyAcceptedAt: true,
        privacyPolicyVersion: true,
        marketingConsent: true,
        analyticsConsent: true,
        mlTrainingConsent: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  async updateConsent(userId: string, consent: UpdateConsentInput) {
    // Filter out undefined values to satisfy Prisma's exactOptionalPropertyTypes
    const data: Record<string, boolean> = {};
    if (consent.marketingConsent !== undefined) data['marketingConsent'] = consent.marketingConsent;
    if (consent.analyticsConsent !== undefined) data['analyticsConsent'] = consent.analyticsConsent;
    if (consent.mlTrainingConsent !== undefined) data['mlTrainingConsent'] = consent.mlTrainingConsent;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        marketingConsent: true,
        analyticsConsent: true,
        mlTrainingConsent: true,
      },
    });

    return updatedUser;
  }

  async acceptTerms(userId: string, termsVersion: string, privacyPolicyVersion: string) {
    const now = new Date();
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        termsAcceptedAt: now,
        termsVersion,
        privacyPolicyAcceptedAt: now,
        privacyPolicyVersion,
      },
      select: {
        termsAcceptedAt: true,
        termsVersion: true,
        privacyPolicyAcceptedAt: true,
        privacyPolicyVersion: true,
      },
    });

    return updatedUser;
  }

  async hasAcceptedCurrentTerms(userId: string, currentTermsVersion: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        termsVersion: true,
        termsAcceptedAt: true,
      },
    });

    if (!user || !user.termsAcceptedAt) {
      return false;
    }

    return user.termsVersion === currentTermsVersion;
  }
}

export const consentService = new ConsentService();
