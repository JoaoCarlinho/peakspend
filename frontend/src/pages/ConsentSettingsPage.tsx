import { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Switch,
  FormControlLabel,
  Divider,
  Alert,
  CircularProgress,
  Stack,
  Button,
} from '@mui/material';
import { consentService } from '../services/consentService';
import type { UserConsent } from '../types/consent';

export function ConsentSettingsPage() {
  const [consent, setConsent] = useState<UserConsent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadConsent();
  }, []);

  const loadConsent = async () => {
    try {
      const data = await consentService.getConsent();
      setConsent(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load consent settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = (field: 'marketingConsent' | 'analyticsConsent' | 'mlTrainingConsent') => {
    if (!consent) return;
    setConsent({ ...consent, [field]: !consent[field] });
  };

  const handleSave = async () => {
    if (!consent) return;

    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await consentService.updateConsent({
        marketingConsent: consent.marketingConsent,
        analyticsConsent: consent.analyticsConsent,
        mlTrainingConsent: consent.mlTrainingConsent,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update consent');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!consent) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error">Failed to load consent settings</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          Privacy & Consent Settings
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Manage your privacy preferences and data usage consent
        </Typography>

        <Divider sx={{ my: 3 }} />

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            Settings saved successfully
          </Alert>
        )}

        <Stack spacing={3}>
          {/* Terms & Privacy */}
          <Box>
            <Typography variant="h6" gutterBottom>
              Terms & Privacy Policy
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Accepted on:{' '}
              {consent.termsAcceptedAt
                ? new Date(consent.termsAcceptedAt).toLocaleDateString()
                : 'Not accepted'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Terms Version: {consent.termsVersion || 'N/A'} | Privacy Policy Version:{' '}
              {consent.privacyPolicyVersion || 'N/A'}
            </Typography>
          </Box>

          <Divider />

          {/* Marketing Consent */}
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={consent.marketingConsent}
                  onChange={() => handleToggle('marketingConsent')}
                />
              }
              label="Marketing Communications"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 6 }}>
              Receive emails about new features, tips, and special offers
            </Typography>
          </Box>

          {/* Analytics Consent */}
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={consent.analyticsConsent}
                  onChange={() => handleToggle('analyticsConsent')}
                />
              }
              label="Analytics & Performance"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 6 }}>
              Help us improve PeakSpend by allowing us to collect anonymous usage data
            </Typography>
          </Box>

          {/* ML Training Consent */}
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={consent.mlTrainingConsent}
                  onChange={() => handleToggle('mlTrainingConsent')}
                />
              }
              label="ML Model Training"
            />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 6 }}>
              Use your expense data to improve ML categorization accuracy (data stays private to your
              account)
            </Typography>
          </Box>

          <Divider />

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Preferences'}
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Container>
  );
}
