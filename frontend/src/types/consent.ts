export interface UserConsent {
  termsAcceptedAt: string | null;
  termsVersion: string | null;
  privacyPolicyAcceptedAt: string | null;
  privacyPolicyVersion: string | null;
  marketingConsent: boolean;
  analyticsConsent: boolean;
  mlTrainingConsent: boolean;
}

export interface UpdateConsentInput {
  marketingConsent?: boolean;
  analyticsConsent?: boolean;
  mlTrainingConsent?: boolean;
}

export interface AcceptTermsInput {
  termsVersion: string;
  privacyPolicyVersion: string;
}

export const CURRENT_TERMS_VERSION = '1.0.0';
export const CURRENT_PRIVACY_VERSION = '1.0.0';
