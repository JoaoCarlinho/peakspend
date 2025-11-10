import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  Link,
} from '@mui/material';
import { consentService } from '../../services/consentService';
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from '../../types/consent';

interface ConsentBannerProps {
  onAccept: () => void;
}

export function ConsentBanner({ onAccept }: ConsentBannerProps) {
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setIsAccepting(true);
    setError(null);

    try {
      // Accept terms and privacy policy
      await consentService.acceptTerms({
        termsVersion: CURRENT_TERMS_VERSION,
        privacyPolicyVersion: CURRENT_PRIVACY_VERSION,
      });

      // Update marketing consent if user opted in
      if (marketingConsent) {
        await consentService.updateConsent({ marketingConsent: true });
      }

      onAccept();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save consent');
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        p: 2,
      }}
    >
      <Paper elevation={8} sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">Privacy & Cookie Notice</Typography>

          <Typography variant="body2" color="text.secondary">
            We use cookies and similar technologies to provide essential functionality and improve
            your experience. By clicking "Accept All", you consent to our use of cookies for
            analytics and ML model training to improve expense categorization.
          </Typography>

          <FormControlLabel
            control={
              <Checkbox
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
              />
            }
            label={
              <Typography variant="body2">
                I agree to receive marketing communications (optional)
              </Typography>
            }
          />

          <Typography variant="caption" color="text.secondary">
            By using PeakSpend, you agree to our{' '}
            <Link href="/terms" target="_blank">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" target="_blank">
              Privacy Policy
            </Link>
            . You can manage your preferences anytime in Settings.
          </Typography>

          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button variant="contained" onClick={handleAccept} disabled={isAccepting}>
              {isAccepting ? 'Accepting...' : 'Accept All'}
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
