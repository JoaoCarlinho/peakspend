/**
 * Sensitive Data Service
 *
 * Handles communication with the sensitive data API endpoints.
 * Bank accounts and payment cards are encrypted at rest on the backend.
 */

import { apiClient } from './api';

// Bank Account Types
export interface BankAccountSummary {
  id: string;
  nickname: string | null;
  bankName: string | null;
  accountType: string | null;
  lastFour: string;
  createdAt: string;
}

export interface BankAccountDetails extends BankAccountSummary {
  accountNumber: string;
  routingNumber: string;
}

export interface AddBankAccountInput {
  accountNumber: string;
  routingNumber: string;
  nickname?: string;
  bankName?: string;
  accountType?: 'checking' | 'savings';
}

// Payment Card Types
export interface PaymentCardSummary {
  id: string;
  nickname: string | null;
  cardholderName: string | null;
  cardType: string;
  lastFour: string;
  expiryMonth: number;
  expiryYear: number;
  createdAt: string;
}

export interface PaymentCardDetails extends PaymentCardSummary {
  cardNumber: string;
}

export interface AddPaymentCardInput {
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  cardholderName?: string;
  nickname?: string;
}

// Bank Account Operations
export async function addBankAccount(input: AddBankAccountInput): Promise<BankAccountSummary> {
  const response = await apiClient.post<{ account: BankAccountSummary }>(
    '/api/user/bank-accounts',
    input
  );
  return response.data.account;
}

export async function getBankAccounts(): Promise<BankAccountSummary[]> {
  const response = await apiClient.get<{ accounts: BankAccountSummary[] }>(
    '/api/user/bank-accounts'
  );
  return response.data.accounts;
}

export async function getBankAccountDetails(id: string): Promise<BankAccountDetails> {
  const response = await apiClient.get<{ account: BankAccountDetails }>(
    `/api/user/bank-accounts/${id}/details`
  );
  return response.data.account;
}

export async function deleteBankAccount(id: string): Promise<void> {
  await apiClient.delete(`/api/user/bank-accounts/${id}`);
}

// Payment Card Operations
export async function addPaymentCard(input: AddPaymentCardInput): Promise<PaymentCardSummary> {
  const response = await apiClient.post<{ card: PaymentCardSummary }>(
    '/api/user/payment-cards',
    input
  );
  return response.data.card;
}

export async function getPaymentCards(): Promise<PaymentCardSummary[]> {
  const response = await apiClient.get<{ cards: PaymentCardSummary[] }>('/api/user/payment-cards');
  return response.data.cards;
}

export async function getPaymentCardDetails(id: string): Promise<PaymentCardDetails> {
  const response = await apiClient.get<{ card: PaymentCardDetails }>(
    `/api/user/payment-cards/${id}/details`
  );
  return response.data.card;
}

export async function deletePaymentCard(id: string): Promise<void> {
  await apiClient.delete(`/api/user/payment-cards/${id}`);
}

export const sensitiveDataService = {
  // Bank accounts
  addBankAccount,
  getBankAccounts,
  getBankAccountDetails,
  deleteBankAccount,
  // Payment cards
  addPaymentCard,
  getPaymentCards,
  getPaymentCardDetails,
  deletePaymentCard,
};
