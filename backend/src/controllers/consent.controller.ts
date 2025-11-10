import type { Request, Response, NextFunction } from 'express';
import { consentService } from '../services/consent.service';

export class ConsentController {
  async getConsent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const consent = await consentService.getUserConsent(userId);
      res.status(200).json(consent);
    } catch (error) {
      next(error);
    }
  }

  async updateConsent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const updatedConsent = await consentService.updateConsent(userId, req.body);
      res.status(200).json(updatedConsent);
    } catch (error) {
      next(error);
    }
  }

  async acceptTerms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { termsVersion, privacyPolicyVersion } = req.body;
      const result = await consentService.acceptTerms(userId, termsVersion, privacyPolicyVersion);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const consentController = new ConsentController();
