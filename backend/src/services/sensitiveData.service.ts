import { getPrismaClient } from '../config/database';
import { encrypt, decrypt, isValidLuhn, detectCardType } from '../utils/encryption';
import { auditLogger } from '../audit';
import { securityConfigService } from '../security/securityConfig.service';
import logger from '../config/logger';

const prisma = getPrismaClient();

/**
 * Sensitive Data Service - Secure Implementation
 *
 * Manages bank accounts and payment cards with encryption at rest.
 * All operations verify userId for tenant isolation.
 *
 * Security Controls:
 * - AES-256-GCM encryption for account/card numbers
 * - Tenant isolation on all queries
 * - Audit logging of all access
 * - Only last 4 digits stored in plaintext
 * - No decryption without explicit need
 */

// Bank Account Types
export interface BankAccountInput {
  accountNumber: string;
  routingNumber: string;
  nickname?: string;
  bankName?: string;
  accountType?: 'checking' | 'savings';
}

export interface BankAccountSummary {
  id: string;
  nickname: string | null;
  bankName: string | null;
  accountType: string | null;
  lastFour: string;
  createdAt: Date;
}

// Payment Card Types
export interface PaymentCardInput {
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  cardholderName?: string;
  nickname?: string;
}

export interface PaymentCardSummary {
  id: string;
  nickname: string | null;
  cardholderName: string | null;
  cardType: string;
  lastFour: string;
  expiryMonth: number;
  expiryYear: number;
  createdAt: Date;
}

/**
 * Add a bank account
 * SECURE: Encrypts sensitive data, logs access
 */
export async function addBankAccount(
  userId: string,
  input: BankAccountInput
): Promise<BankAccountSummary> {
  // Validate routing number format (9 digits)
  const routingClean = input.routingNumber.replace(/\D/g, '');
  if (routingClean.length !== 9) {
    throw new Error('Invalid routing number format');
  }

  // Validate account number
  const accountClean = input.accountNumber.replace(/\D/g, '');
  if (accountClean.length < 4 || accountClean.length > 17) {
    throw new Error('Invalid account number format');
  }

  const lastFour = accountClean.slice(-4);

  // Encrypt sensitive data
  const accountNumberEncrypted = encrypt(accountClean);
  const routingNumberEncrypted = encrypt(routingClean);

  const account = await prisma.bankAccount.create({
    data: {
      userId,
      accountNumberEncrypted,
      routingNumberEncrypted,
      lastFour,
      nickname: input.nickname || null,
      bankName: input.bankName || null,
      accountType: input.accountType || null,
    },
  });

  // Audit logging
  if (securityConfigService.isFeatureEnabled('AUDIT_LOGGING_ENABLED')) {
    await auditLogger.logSecurityEvent({
      eventType: 'BANK_ACCOUNT_ADDED',
      severity: 'MEDIUM',
      userId,
      details: {
        accountId: account.id,
        lastFour,
        bankName: input.bankName,
      },
    });
  }

  logger.info('Bank account added', {
    event: 'BANK_ACCOUNT_ADDED',
    userId,
    accountId: account.id,
    lastFour,
  });

  return {
    id: account.id,
    nickname: account.nickname,
    bankName: account.bankName,
    accountType: account.accountType,
    lastFour: account.lastFour,
    createdAt: account.createdAt,
  };
}

/**
 * Get all bank accounts for a user (summary only - no decryption)
 * SECURE: Only returns masked data
 */
export async function getBankAccounts(userId: string): Promise<BankAccountSummary[]> {
  const accounts = await prisma.bankAccount.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      nickname: true,
      bankName: true,
      accountType: true,
      lastFour: true,
      createdAt: true,
    },
  });

  return accounts;
}

/**
 * Get full bank account details (with decryption)
 * SECURE: Requires explicit access, logs audit event
 */
export async function getBankAccountDetails(
  userId: string,
  accountId: string
): Promise<{
  id: string;
  accountNumber: string;
  routingNumber: string;
  nickname: string | null;
  bankName: string | null;
  accountType: string | null;
} | null> {
  const account = await prisma.bankAccount.findFirst({
    where: {
      id: accountId,
      userId, // SECURE: Tenant isolation
    },
  });

  if (!account) {
    return null;
  }

  // Decrypt sensitive data
  const accountNumber = decrypt(account.accountNumberEncrypted);
  const routingNumber = decrypt(account.routingNumberEncrypted);

  // Audit logging - accessing decrypted data is a security event
  if (securityConfigService.isFeatureEnabled('AUDIT_LOGGING_ENABLED')) {
    await auditLogger.logSecurityEvent({
      eventType: 'BANK_ACCOUNT_DECRYPTED',
      severity: 'MEDIUM',
      userId,
      details: {
        accountId,
        lastFour: account.lastFour,
        reason: 'user_request',
      },
    });
  }

  logger.info('Bank account details accessed', {
    event: 'BANK_ACCOUNT_DECRYPTED',
    userId,
    accountId,
    lastFour: account.lastFour,
  });

  return {
    id: account.id,
    accountNumber,
    routingNumber,
    nickname: account.nickname,
    bankName: account.bankName,
    accountType: account.accountType,
  };
}

/**
 * Delete a bank account
 * SECURE: Verifies ownership, logs deletion
 */
export async function deleteBankAccount(
  userId: string,
  accountId: string
): Promise<{ success: boolean; message: string }> {
  const account = await prisma.bankAccount.findFirst({
    where: {
      id: accountId,
      userId, // SECURE: Tenant isolation
    },
  });

  if (!account) {
    return { success: false, message: 'Bank account not found' };
  }

  await prisma.bankAccount.delete({
    where: { id: accountId },
  });

  // Audit logging
  if (securityConfigService.isFeatureEnabled('AUDIT_LOGGING_ENABLED')) {
    await auditLogger.logSecurityEvent({
      eventType: 'BANK_ACCOUNT_DELETED',
      severity: 'MEDIUM',
      userId,
      details: {
        accountId,
        lastFour: account.lastFour,
      },
    });
  }

  logger.info('Bank account deleted', {
    event: 'BANK_ACCOUNT_DELETED',
    userId,
    accountId,
  });

  return { success: true, message: 'Bank account deleted successfully' };
}

/**
 * Add a payment card
 * SECURE: Validates card, encrypts data, logs access
 */
export async function addPaymentCard(
  userId: string,
  input: PaymentCardInput
): Promise<PaymentCardSummary> {
  // Validate and clean card number
  const cardClean = input.cardNumber.replace(/\D/g, '');

  // Validate using Luhn algorithm
  if (!isValidLuhn(cardClean)) {
    throw new Error('Invalid card number');
  }

  // Detect card type
  const cardType = detectCardType(cardClean);

  // Validate expiry
  const now = new Date();
  const expiryDate = new Date(input.expiryYear, input.expiryMonth - 1);
  if (expiryDate < now) {
    throw new Error('Card has expired');
  }

  const lastFour = cardClean.slice(-4);

  // Encrypt card number
  const cardNumberEncrypted = encrypt(cardClean);

  const card = await prisma.paymentCard.create({
    data: {
      userId,
      cardNumberEncrypted,
      lastFour,
      expiryMonth: input.expiryMonth,
      expiryYear: input.expiryYear,
      cardType,
      nickname: input.nickname || null,
      cardholderName: input.cardholderName || null,
    },
  });

  // Audit logging
  if (securityConfigService.isFeatureEnabled('AUDIT_LOGGING_ENABLED')) {
    await auditLogger.logSecurityEvent({
      eventType: 'PAYMENT_CARD_ADDED',
      severity: 'MEDIUM',
      userId,
      details: {
        cardId: card.id,
        cardType,
        lastFour,
      },
    });
  }

  logger.info('Payment card added', {
    event: 'PAYMENT_CARD_ADDED',
    userId,
    cardId: card.id,
    cardType,
    lastFour,
  });

  return {
    id: card.id,
    nickname: card.nickname,
    cardholderName: card.cardholderName,
    cardType: card.cardType,
    lastFour: card.lastFour,
    expiryMonth: card.expiryMonth,
    expiryYear: card.expiryYear,
    createdAt: card.createdAt,
  };
}

/**
 * Get all payment cards for a user (summary only - no decryption)
 * SECURE: Only returns masked data
 */
export async function getPaymentCards(userId: string): Promise<PaymentCardSummary[]> {
  const cards = await prisma.paymentCard.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      nickname: true,
      cardholderName: true,
      cardType: true,
      lastFour: true,
      expiryMonth: true,
      expiryYear: true,
      createdAt: true,
    },
  });

  return cards;
}

/**
 * Get full payment card details (with decryption)
 * SECURE: Requires explicit access, logs audit event
 */
export async function getPaymentCardDetails(
  userId: string,
  cardId: string
): Promise<{
  id: string;
  cardNumber: string;
  cardType: string;
  expiryMonth: number;
  expiryYear: number;
  cardholderName: string | null;
  nickname: string | null;
} | null> {
  const card = await prisma.paymentCard.findFirst({
    where: {
      id: cardId,
      userId, // SECURE: Tenant isolation
    },
  });

  if (!card) {
    return null;
  }

  // Decrypt card number
  const cardNumber = decrypt(card.cardNumberEncrypted);

  // Audit logging - accessing decrypted data is a security event
  if (securityConfigService.isFeatureEnabled('AUDIT_LOGGING_ENABLED')) {
    await auditLogger.logSecurityEvent({
      eventType: 'PAYMENT_CARD_DECRYPTED',
      severity: 'MEDIUM',
      userId,
      details: {
        cardId,
        cardType: card.cardType,
        lastFour: card.lastFour,
        reason: 'user_request',
      },
    });
  }

  logger.info('Payment card details accessed', {
    event: 'PAYMENT_CARD_DECRYPTED',
    userId,
    cardId,
    lastFour: card.lastFour,
  });

  return {
    id: card.id,
    cardNumber,
    cardType: card.cardType,
    expiryMonth: card.expiryMonth,
    expiryYear: card.expiryYear,
    cardholderName: card.cardholderName,
    nickname: card.nickname,
  };
}

/**
 * Delete a payment card
 * SECURE: Verifies ownership, logs deletion
 */
export async function deletePaymentCard(
  userId: string,
  cardId: string
): Promise<{ success: boolean; message: string }> {
  const card = await prisma.paymentCard.findFirst({
    where: {
      id: cardId,
      userId, // SECURE: Tenant isolation
    },
  });

  if (!card) {
    return { success: false, message: 'Payment card not found' };
  }

  await prisma.paymentCard.delete({
    where: { id: cardId },
  });

  // Audit logging
  if (securityConfigService.isFeatureEnabled('AUDIT_LOGGING_ENABLED')) {
    await auditLogger.logSecurityEvent({
      eventType: 'PAYMENT_CARD_DELETED',
      severity: 'MEDIUM',
      userId,
      details: {
        cardId,
        cardType: card.cardType,
        lastFour: card.lastFour,
      },
    });
  }

  logger.info('Payment card deleted', {
    event: 'PAYMENT_CARD_DELETED',
    userId,
    cardId,
  });

  return { success: true, message: 'Payment card deleted successfully' };
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
