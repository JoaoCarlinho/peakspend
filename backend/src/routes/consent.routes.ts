import { Router } from 'express';
import { consentController } from '../controllers/consent.controller';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { updateConsentSchema, acceptTermsSchema } from '../validation/consent.validation';

const router = Router();

// GET /api/consent - Get user consent preferences
router.get('/', requireAuth, consentController.getConsent.bind(consentController));

// PUT /api/consent - Update consent preferences
router.put(
  '/',
  requireAuth,
  validateRequest(updateConsentSchema),
  consentController.updateConsent.bind(consentController)
);

// POST /api/consent/accept-terms - Accept terms and privacy policy
router.post(
  '/accept-terms',
  requireAuth,
  validateRequest(acceptTermsSchema),
  consentController.acceptTerms.bind(consentController)
);

export default router;
