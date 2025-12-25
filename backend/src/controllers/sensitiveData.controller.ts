import { Request, Response, NextFunction } from 'express';
import { sensitiveDataService } from '../services/sensitiveData.service';
import logger from '../config/logger';

/**
 * Sensitive Data Controller - Secure Implementation
 *
 * Handles HTTP requests for bank accounts and payment cards.
 * Authentication is enforced at the route level via auth middleware.
 */

interface AuthenticatedRequest extends Request {
  userId?: string;
}

// ============ Bank Account Endpoints ============

/**
 * Add a bank account
 * POST /api/user/bank-accounts
 */
export async function addBankAccount(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const { accountNumber, routingNumber, nickname, bankName, accountType } = req.body;

    if (!accountNumber || !routingNumber) {
      res.status(400).json({
        error: 'Account number and routing number are required',
        code: 'INVALID_INPUT',
      });
      return;
    }

    const account = await sensitiveDataService.addBankAccount(userId, {
      accountNumber,
      routingNumber,
      nickname,
      bankName,
      accountType,
    });

    res.status(201).json(account);
  } catch (error) {
    logger.error('Failed to add bank account', {
      event: 'BANK_ACCOUNT_ADD_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

/**
 * Get all bank accounts (summary only)
 * GET /api/user/bank-accounts
 */
export async function getBankAccounts(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const accounts = await sensitiveDataService.getBankAccounts(userId);
    res.json({ accounts });
  } catch (error) {
    logger.error('Failed to get bank accounts', {
      event: 'BANK_ACCOUNTS_GET_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

/**
 * Get bank account details (with decryption)
 * GET /api/user/bank-accounts/:id/details
 */
export async function getBankAccountDetails(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const accountId = req.params['id'];
    if (!accountId) {
      res.status(400).json({ error: 'Account ID is required', code: 'INVALID_ID' });
      return;
    }

    const account = await sensitiveDataService.getBankAccountDetails(userId, accountId);
    if (!account) {
      res.status(404).json({ error: 'Bank account not found', code: 'NOT_FOUND' });
      return;
    }

    res.json(account);
  } catch (error) {
    logger.error('Failed to get bank account details', {
      event: 'BANK_ACCOUNT_DETAILS_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

/**
 * Delete a bank account
 * DELETE /api/user/bank-accounts/:id
 */
export async function deleteBankAccount(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const accountId = req.params['id'];
    if (!accountId) {
      res.status(400).json({ error: 'Account ID is required', code: 'INVALID_ID' });
      return;
    }

    const result = await sensitiveDataService.deleteBankAccount(userId, accountId);
    if (!result.success) {
      res.status(404).json({ error: result.message, code: 'DELETE_FAILED' });
      return;
    }

    res.json({ message: result.message });
  } catch (error) {
    logger.error('Failed to delete bank account', {
      event: 'BANK_ACCOUNT_DELETE_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

// ============ Payment Card Endpoints ============

/**
 * Add a payment card
 * POST /api/user/payment-cards
 */
export async function addPaymentCard(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const { cardNumber, expiryMonth, expiryYear, cardholderName, nickname } = req.body;

    if (!cardNumber || !expiryMonth || !expiryYear) {
      res.status(400).json({
        error: 'Card number, expiry month, and expiry year are required',
        code: 'INVALID_INPUT',
      });
      return;
    }

    const card = await sensitiveDataService.addPaymentCard(userId, {
      cardNumber,
      expiryMonth: Number(expiryMonth),
      expiryYear: Number(expiryYear),
      cardholderName,
      nickname,
    });

    res.status(201).json(card);
  } catch (error) {
    logger.error('Failed to add payment card', {
      event: 'PAYMENT_CARD_ADD_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

/**
 * Get all payment cards (summary only)
 * GET /api/user/payment-cards
 */
export async function getPaymentCards(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const cards = await sensitiveDataService.getPaymentCards(userId);
    res.json({ cards });
  } catch (error) {
    logger.error('Failed to get payment cards', {
      event: 'PAYMENT_CARDS_GET_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

/**
 * Get payment card details (with decryption)
 * GET /api/user/payment-cards/:id/details
 */
export async function getPaymentCardDetails(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const cardId = req.params['id'];
    if (!cardId) {
      res.status(400).json({ error: 'Card ID is required', code: 'INVALID_ID' });
      return;
    }

    const card = await sensitiveDataService.getPaymentCardDetails(userId, cardId);
    if (!card) {
      res.status(404).json({ error: 'Payment card not found', code: 'NOT_FOUND' });
      return;
    }

    res.json(card);
  } catch (error) {
    logger.error('Failed to get payment card details', {
      event: 'PAYMENT_CARD_DETAILS_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

/**
 * Delete a payment card
 * DELETE /api/user/payment-cards/:id
 */
export async function deletePaymentCard(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const cardId = req.params['id'];
    if (!cardId) {
      res.status(400).json({ error: 'Card ID is required', code: 'INVALID_ID' });
      return;
    }

    const result = await sensitiveDataService.deletePaymentCard(userId, cardId);
    if (!result.success) {
      res.status(404).json({ error: result.message, code: 'DELETE_FAILED' });
      return;
    }

    res.json({ message: result.message });
  } catch (error) {
    logger.error('Failed to delete payment card', {
      event: 'PAYMENT_CARD_DELETE_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

export const sensitiveDataController = {
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
