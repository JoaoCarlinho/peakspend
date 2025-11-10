import { apiClient } from './api';
import type { UserConsent, UpdateConsentInput, AcceptTermsInput } from '../types/consent';

export const consentService = {
  /**
   * Get user consent preferences
   */
  async getConsent(): Promise<UserConsent> {
    const response = await apiClient.get<UserConsent>('/api/consent');
    return response.data;
  },

  /**
   * Update consent preferences
   */
  async updateConsent(consent: UpdateConsentInput): Promise<Partial<UserConsent>> {
    const response = await apiClient.put<Partial<UserConsent>>('/api/consent', consent);
    return response.data;
  },

  /**
   * Accept terms and privacy policy
   */
  async acceptTerms(input: AcceptTermsInput): Promise<Partial<UserConsent>> {
    const response = await apiClient.post<Partial<UserConsent>>('/api/consent/accept-terms', input);
    return response.data;
  },
};
