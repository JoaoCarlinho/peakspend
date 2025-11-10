import { Box, Alert, AlertTitle, Stack, Chip } from '@mui/material';
import { Warning as WarningIcon, Error as ErrorIcon, Info as InfoIcon } from '@mui/icons-material';
import type { ExpenseError } from '../../types/ml-suggestion';

interface ErrorDetectionProps {
  errors: ExpenseError[];
  isLoading: boolean;
}

export function ErrorDetection({ errors, isLoading }: ErrorDetectionProps) {
  if (isLoading || !errors || errors.length === 0) {
    return null;
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high':
        return <ErrorIcon />;
      case 'medium':
        return <WarningIcon />;
      case 'low':
        return <InfoIcon />;
      default:
        return <InfoIcon />;
    }
  };

  const getSeverityColor = (severity: string): 'error' | 'warning' | 'info' => {
    switch (severity) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'info';
    }
  };

  return (
    <Stack spacing={1}>
      {errors.map((error, index) => (
        <Alert
          key={index}
          severity={getSeverityColor(error.severity)}
          icon={getSeverityIcon(error.severity)}
        >
          <AlertTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {error.field}
              <Chip
                label={error.severity}
                size="small"
                color={getSeverityColor(error.severity)}
                sx={{ height: 18, fontSize: '0.7rem', textTransform: 'uppercase' }}
              />
            </Box>
          </AlertTitle>
          {error.message}
          {error.suggestion && (
            <Box sx={{ mt: 1, fontStyle: 'italic' }}>
              💡 Suggestion: {error.suggestion}
            </Box>
          )}
        </Alert>
      ))}
    </Stack>
  );
}
