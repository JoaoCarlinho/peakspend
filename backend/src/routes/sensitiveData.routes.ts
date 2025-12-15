import { Router } from 'express';
import { sensitiveDataController } from '../controllers/sensitiveData.controller';
import { requireAuth } from '../middleware/auth.middleware';

/**
 * Sensitive Data Routes - Secure Implementation
 *
 * All routes require authentication.
 * Encryption and audit logging handled at service level.
 */

const router = Router();

// All sensitive data routes require authentication
router.use(requireAuth);

// Bank account routes
router.post('/bank-accounts', sensitiveDataController.addBankAccount);
router.get('/bank-accounts', sensitiveDataController.getBankAccounts);
router.get('/bank-accounts/:id/details', sensitiveDataController.getBankAccountDetails);
router.delete('/bank-accounts/:id', sensitiveDataController.deleteBankAccount);

// Payment card routes
router.post('/payment-cards', sensitiveDataController.addPaymentCard);
router.get('/payment-cards', sensitiveDataController.getPaymentCards);
router.get('/payment-cards/:id/details', sensitiveDataController.getPaymentCardDetails);
router.delete('/payment-cards/:id', sensitiveDataController.deletePaymentCard);

export default router;
