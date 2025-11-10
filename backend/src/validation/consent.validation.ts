import { z } from 'zod';

export const updateConsentSchema = z.object({
  body: z.object({
    marketingConsent: z.boolean().optional(),
    analyticsConsent: z.boolean().optional(),
    mlTrainingConsent: z.boolean().optional(),
  }),
});

export const acceptTermsSchema = z.object({
  body: z.object({
    termsVersion: z.string().min(1),
    privacyPolicyVersion: z.string().min(1),
  }),
});

export type UpdateConsentInput = z.infer<typeof updateConsentSchema>['body'];
export type AcceptTermsInput = z.infer<typeof acceptTermsSchema>['body'];
